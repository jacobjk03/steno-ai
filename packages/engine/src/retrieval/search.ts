import type { StorageAdapter } from '../adapters/storage.js';
import type { EmbeddingAdapter } from '../adapters/embedding.js';
import type { CacheAdapter } from '../adapters/cache.js';
import type { LLMAdapter } from '../adapters/llm.js';
import type { SearchOptions, SearchResponse, FusionWeights, Candidate } from './types.js';
import { DEFAULT_FUSION_WEIGHTS } from './types.js';
import { compoundSearchSignal } from './compound-search.js';
import { graphSearch } from './graph-traversal.js';
import { matchTriggers } from './trigger-matcher.js';
import { scoreSalience } from './salience-scorer.js';
import { fuseAndRank } from './fusion.js';
import { surfaceContradictions } from './contradiction-surfacer.js';
import { recordAccesses } from '../feedback/tracker.js';
import { CachedEmbeddingAdapter } from './embedding-cache.js';
import { rerank } from './reranker.js';
import { expandQueryHeuristic } from './query-expansion.js';
import { extractTimeReference, scoreTemporalRelevance } from './temporal-scorer.js';

export interface SearchConfig {
  storage: StorageAdapter;
  embedding: EmbeddingAdapter;
  cache?: CacheAdapter;  // if provided, wraps embedding with cache
  defaultWeights?: FusionWeights;
  salienceHalfLifeDays?: number;
  salienceNormalizationK?: number;
  graphMaxDepth?: number;
  graphMaxEntities?: number;
  rerankerLLM?: LLMAdapter; // Deprecated — use embedding-based reranking instead
  rerank?: boolean; // If true, re-ranks results using embedding similarity (deterministic, free)
  /** LLM for query expansion (optional — falls back to heuristic expansion) */
  expansionLLM?: LLMAdapter;
}

export async function search(
  config: SearchConfig,
  options: SearchOptions,
): Promise<SearchResponse> {
  const startTime = Date.now();
  const limit = Math.min(options.limit ?? 10, 100);
  const weights = options.weights ?? config.defaultWeights ?? DEFAULT_FUSION_WEIGHTS;
  const fetchMultiplier = 3; // fetch 3x limit from each signal for better fusion

  // Wrap embedding with cache if available
  const effectiveEmbedding = config.cache
    ? new CachedEmbeddingAdapter(config.embedding, config.cache)
    : config.embedding;

  // 1. Run all signals in PARALLEL — ONE compound search (not multiple)
  //    Multi-query expansion adds latency (3× embedding calls). Instead:
  //    - Single compound search with original query (vector + keyword in 1 DB call)
  //    - Graph search with original query
  //    - Trigger matching
  //    All parallel = single round trip time.
  const t0 = Date.now();

  const tCompound = Date.now();
  const compoundPromise = compoundSearchSignal(config.storage, effectiveEmbedding, options.query, options.tenantId, options.scope, options.scopeId, limit * fetchMultiplier).catch(() => ({ vectorCandidates: [] as Candidate[], keywordCandidates: [] as Candidate[] }));
  const tGraph = Date.now();
  const graphPromise = graphSearch(config.storage, effectiveEmbedding, options.query, options.tenantId, options.scope, options.scopeId, limit * fetchMultiplier, { maxDepth: config.graphMaxDepth, maxEntities: config.graphMaxEntities, asOf: options.temporalFilter?.asOf }).catch(() => [] as Candidate[]);
  const tTrigger = Date.now();
  const triggerPromise = matchTriggers(config.storage, effectiveEmbedding, options.query, options.tenantId, options.scope, options.scopeId).catch(() => ({ candidates: [] as Candidate[], triggersMatched: [] as string[] }));

  const [compoundResult, graphSettled, triggerSettled] = await Promise.all([
    compoundPromise.then(r => { console.error(`[steno-search] compound: ${Date.now() - tCompound}ms (vec=${r.vectorCandidates.length}, kw=${r.keywordCandidates.length})`); return r; }),
    graphPromise.then(r => { console.error(`[steno-search] graph: ${Date.now() - tGraph}ms (${Array.isArray(r) ? r.length : 0} candidates)`); return r; }),
    triggerPromise.then(r => { console.error(`[steno-search] trigger: ${Date.now() - tTrigger}ms`); return r; }),
  ]);
  console.error(`[steno-search] Signals total: ${Date.now() - t0}ms`);

  const vectorCandidates = compoundResult.vectorCandidates;
  const keywordCandidates = compoundResult.keywordCandidates;
  const graphCandidates = Array.isArray(graphSettled) ? graphSettled : [];
  const triggerResult = triggerSettled;
  const triggersMatched = triggerResult.triggersMatched;

  // 2. Triple-tier pre-fusion reranking — rerank each stream INDEPENDENTLY
  //    Only rerank when there are enough candidates to justify the embedding cost
  //    before fusion, like Hydra DB's triple-tier architecture.
  const t1 = Date.now();

  // Batch-embed query + all unique candidate contents in ONE call
  const allPreRerankCandidates = [...vectorCandidates, ...graphCandidates];
  let queryEmbedding: number[] | null = null;
  const candidateEmbeddings = new Map<string, number[]>();

  // Only rerank if we have >10 candidates — for small sets the original order is fine
  if (allPreRerankCandidates.length > 10) {
    try {
      const uniqueTexts = new Map<string, string>();
      for (const c of allPreRerankCandidates) {
        if (!uniqueTexts.has(c.fact.id)) uniqueTexts.set(c.fact.id, c.fact.content);
      }
      const textsToEmbed = [options.query, ...uniqueTexts.values()];
      const embeddings = await effectiveEmbedding.embedBatch(textsToEmbed);
      queryEmbedding = embeddings[0]!;
      let idx = 1;
      for (const [factId] of uniqueTexts) {
        candidateEmbeddings.set(factId, embeddings[idx++]!);
      }
    } catch {
      // Reranking fails silently — proceed without it
    }
  }

  // Rerank vector candidates
  if (queryEmbedding && vectorCandidates.length > 1) {
    const RERANK_W = 0.4;
    for (const c of vectorCandidates) {
      const factEmb = candidateEmbeddings.get(c.fact.id);
      if (factEmb) {
        const sim = cosineSim(queryEmbedding, factEmb);
        c.vectorScore = c.vectorScore * (1 - RERANK_W) + sim * RERANK_W;
      }
    }
    vectorCandidates.sort((a, b) => b.vectorScore - a.vectorScore);
  }

  // Rerank graph candidates
  if (queryEmbedding && graphCandidates.length > 1) {
    const RERANK_W = 0.4;
    for (const c of graphCandidates) {
      const factEmb = candidateEmbeddings.get(c.fact.id);
      if (factEmb) {
        const sim = cosineSim(queryEmbedding, factEmb);
        c.graphScore = c.graphScore * (1 - RERANK_W) + sim * RERANK_W;
      }
    }
    graphCandidates.sort((a, b) => b.graphScore - a.graphScore);
  }
  // Keyword candidates skip reranking — FTS scores shouldn't be overridden by embeddings
  console.error(`[steno-search] Pre-fusion rerank: ${Date.now() - t1}ms`);

  // 3. Merge all pre-reranked streams
  const allCandidates: Candidate[] = [
    ...vectorCandidates,
    ...keywordCandidates,
    ...graphCandidates,
    ...triggerResult.candidates,
  ];

  if (allCandidates.length === 0) {
    return {
      results: [],
      triggersMatched,
      totalCandidates: 0,
      durationMs: Date.now() - startTime,
    };
  }

  // 4. Score salience + recency on all candidates
  const scoredCandidates = scoreSalience(allCandidates, {
    halfLifeDays: config.salienceHalfLifeDays,
    normalizationK: config.salienceNormalizationK,
  });

  // 4b. Score temporal relevance if query has time reference
  const timeRef = extractTimeReference(options.query);
  if (timeRef) {
    scoreTemporalRelevance(scoredCandidates, timeRef);
  }

  // 5. Fuse and rank
  const fusionResults = fuseAndRank(scoredCandidates, weights, limit);

  // 5b. Lineage dedup — keep only the highest-scored version per lineage
  //     Git-style append-only means multiple versions coexist. For normal queries,
  //     show only the latest. For "includeHistory" queries, show all versions.
  let dedupedResults = fusionResults;
  if (!options.includeHistory) {
    const lineageSeen = new Map<string, number>();
    dedupedResults = fusionResults.filter((r, idx) => {
      const lid = r.fact.lineageId;
      if (!lid) return true;
      if (lineageSeen.has(lid)) return false;
      lineageSeen.set(lid, idx);
      return true;
    });
  }

  // 5c. Knowledge chain resolution — if a result has metadata.relationType === 'updates',
  // check if the fact it updates is ALSO in results. If so, suppress the older one.
  const updatedFactIds = new Set<string>();
  for (const r of dedupedResults) {
    const meta = r.fact.metadata as Record<string, unknown> | undefined;
    if (meta?.relationType === 'updates' && meta?.relatedFactId) {
      updatedFactIds.add(meta.relatedFactId as string);
    }
  }
  if (updatedFactIds.size > 0) {
    dedupedResults = dedupedResults.filter(r => !updatedFactIds.has(r.fact.id));
  }

  // 5d. Token budget trimming — keep highest-scored results that fit within budget
  if (options.tokenBudget && options.tokenBudget > 0) {
    let tokenCount = 0;
    const budgetResults: typeof dedupedResults = [];
    for (const r of dedupedResults) {
      // Rough token estimate: content chars / 4, plus sourceChunk if present
      const factTokens = Math.ceil(r.fact.content.length / 4) +
        (r.fact.sourceChunk ? Math.ceil(r.fact.sourceChunk.length / 4) : 0);
      if (tokenCount + factTokens > options.tokenBudget) break;
      tokenCount += factTokens;
      budgetResults.push(r);
    }
    dedupedResults = budgetResults;
  }

  // 6. Enrich with contradiction context
  let results = await surfaceContradictions(config.storage, options.tenantId, dedupedResults);
  console.error(`[steno-search] Fusion + dedup: ${Date.now() - t1}ms, Total: ${Date.now() - startTime}ms`);

  // 6. Optionally enrich with graph context
  if (options.includeGraph) {
    for (const result of results) {
      const entities = await config.storage.getEntitiesForFact(result.fact.id);
      const edges: typeof result.graph extends undefined ? never : NonNullable<typeof result.graph>['edges'] = [];
      for (const entity of entities) {
        const entityEdges = await config.storage.getEdgesForEntity(options.tenantId, entity.id);
        edges.push(...entityEdges);
      }
      result.graph = { entities, edges };
    }
  }

  // 7. Optionally enrich with fact history (previous versions)
  if (options.includeHistory) {
    for (const result of results) {
      const history = await config.storage.getFactsByLineage(options.tenantId, result.fact.lineageId);
      // Filter out the current fact, sort by version ascending
      result.history = history
        .filter(f => f.id !== result.fact.id)
        .sort((a, b) => a.version - b.version);
    }
  }

  // 8. Record memory accesses for metamemory + update decay scores (fire-and-forget)
  void recordAccesses(config.storage, options.tenantId, options.query, results, {
    halfLifeDays: config.salienceHalfLifeDays,
    normalizationK: config.salienceNormalizationK,
  }).catch(err => console.error('[steno] Failed to record memory accesses:', err));

  return {
    results,
    triggersMatched,
    totalCandidates: allCandidates.length,
    durationMs: Date.now() - startTime,
  };
}

/** Fast cosine similarity for pre-fusion reranking */
function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

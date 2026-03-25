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

  // 0. Multi-query expansion — generate diverse reformulations for better recall
  //    Like Hydra DB's Adaptive Query Expansion. Each variant captures a different intent.
  const expandedQueries = expandQueryHeuristic(options.query);
  console.error(`[steno-search] Expanded query into ${expandedQueries.length} variants: ${expandedQueries.map(q => `"${q.slice(0, 40)}"`).join(', ')}`);

  // 1. Run signals in PARALLEL for ALL expanded queries + graph + triggers
  const t0 = Date.now();

  // Run compound search on each expanded query in parallel
  const compoundPromises = expandedQueries.map(q =>
    compoundSearchSignal(config.storage, effectiveEmbedding, q, options.tenantId, options.scope, options.scopeId, limit * fetchMultiplier)
  );

  const [compoundResults, graphSettled, triggerSettled] = await Promise.all([
    Promise.allSettled(compoundPromises),
    graphSearch(config.storage, effectiveEmbedding, options.query, options.tenantId, options.scope, options.scopeId, limit * fetchMultiplier, { maxDepth: config.graphMaxDepth, maxEntities: config.graphMaxEntities, asOf: options.temporalFilter?.asOf }).catch(() => [] as Candidate[]),
    matchTriggers(config.storage, effectiveEmbedding, options.query, options.tenantId, options.scope, options.scopeId).catch(() => ({ candidates: [] as Candidate[], triggersMatched: [] as string[] })),
  ]);
  console.error(`[steno-search] Signals: ${Date.now() - t0}ms (${compoundResults.length} compound queries, graph=${graphSettled ? 'ok' : 'empty'}, trigger=ok)`);

  // Merge compound search results from all expanded queries (deduplicate by fact ID)
  const vectorCandidates: Candidate[] = [];
  const keywordCandidates: Candidate[] = [];
  const seenFactIds = new Set<string>();

  for (const settled of compoundResults) {
    if (settled.status !== 'fulfilled') continue;
    for (const c of settled.value.vectorCandidates) {
      if (!seenFactIds.has(c.fact.id)) {
        seenFactIds.add(c.fact.id);
        vectorCandidates.push(c);
      }
    }
    for (const c of settled.value.keywordCandidates) {
      if (!seenFactIds.has(c.fact.id)) {
        seenFactIds.add(c.fact.id);
        keywordCandidates.push(c);
      }
    }
  }

  const graphCandidates = Array.isArray(graphSettled) ? graphSettled : [];
  const triggerResult = triggerSettled;
  const triggersMatched = triggerResult.triggersMatched;

  // 2. Merge all candidates
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

  // 3. Score salience + recency on all candidates
  const scoredCandidates = scoreSalience(allCandidates, {
    halfLifeDays: config.salienceHalfLifeDays,
    normalizationK: config.salienceNormalizationK,
  });

  // 4. Fuse and rank
  const fusionResults = fuseAndRank(scoredCandidates, weights, limit);

  // 5. Enrich with contradiction context
  let results = await surfaceContradictions(config.storage, options.tenantId, fusionResults);

  // 5b. Embedding-based re-ranking (deterministic, ~300ms via batch embed).
  const t1 = Date.now();
  if (results.length > 1) {
    results = await rerank(effectiveEmbedding, options.query, results, limit);
  }
  console.error(`[steno-search] Rerank: ${Date.now() - t1}ms, Total so far: ${Date.now() - startTime}ms`);

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

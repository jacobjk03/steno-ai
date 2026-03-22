import type { StorageAdapter } from '../adapters/storage.js';
import type { EmbeddingAdapter } from '../adapters/embedding.js';
import type { CacheAdapter } from '../adapters/cache.js';
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

export interface SearchConfig {
  storage: StorageAdapter;
  embedding: EmbeddingAdapter;
  cache?: CacheAdapter;  // if provided, wraps embedding with cache
  defaultWeights?: FusionWeights;
  salienceHalfLifeDays?: number;
  salienceNormalizationK?: number;
  graphMaxDepth?: number;
  graphMaxEntities?: number;
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

  // 1. Run signals in PARALLEL using Promise.allSettled (graceful degradation)
  //    Compound search replaces separate vector + keyword calls (2 DB calls → 1)
  const [compoundSettled, graphSettled, triggerSettled] = await Promise.allSettled([
    compoundSearchSignal(config.storage, effectiveEmbedding, options.query, options.tenantId, options.scope, options.scopeId, limit * fetchMultiplier),
    graphSearch(config.storage, effectiveEmbedding, options.query, options.tenantId, options.scope, options.scopeId, limit * fetchMultiplier, { maxDepth: config.graphMaxDepth, maxEntities: config.graphMaxEntities, asOf: options.temporalFilter?.asOf }),
    matchTriggers(config.storage, effectiveEmbedding, options.query, options.tenantId, options.scope, options.scopeId),
  ]);

  // Extract results, using empty arrays for failed signals (graceful degradation)
  const compoundResult = compoundSettled.status === 'fulfilled' ? compoundSettled.value : { vectorCandidates: [], keywordCandidates: [] };
  const vectorCandidates = compoundResult.vectorCandidates;
  const keywordCandidates = compoundResult.keywordCandidates;
  const graphCandidates = graphSettled.status === 'fulfilled' ? graphSettled.value : [];
  const triggerResult = triggerSettled.status === 'fulfilled' ? triggerSettled.value : { candidates: [], triggersMatched: [] };
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
  const results = await surfaceContradictions(config.storage, options.tenantId, fusionResults);

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

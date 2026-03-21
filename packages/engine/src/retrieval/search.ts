import type { StorageAdapter } from '../adapters/storage.js';
import type { EmbeddingAdapter } from '../adapters/embedding.js';
import type { SearchOptions, SearchResponse, SearchResult, FusionWeights, Candidate } from './types.js';
import { DEFAULT_FUSION_WEIGHTS } from './types.js';
import { vectorSearch } from './vector-search.js';
import { keywordSearch } from './keyword-search.js';
import { graphSearch } from './graph-traversal.js';
import { matchTriggers } from './trigger-matcher.js';
import { scoreSalience } from './salience-scorer.js';
import { fuseAndRank } from './fusion.js';
import { surfaceContradictions } from './contradiction-surfacer.js';
import { recordAccesses } from '../feedback/tracker.js';
import { calculateDecayScore } from '../salience/decay.js';

export interface SearchConfig {
  storage: StorageAdapter;
  embedding: EmbeddingAdapter;
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

  // 1. Run all signals in PARALLEL using Promise.allSettled (graceful degradation)
  const [vectorSettled, keywordSettled, graphSettled, triggerSettled] = await Promise.allSettled([
    vectorSearch(config.storage, config.embedding, options.query, options.tenantId, options.scope, options.scopeId, limit * fetchMultiplier, options.temporalFilter?.asOf),
    keywordSearch(config.storage, options.query, options.tenantId, options.scope, options.scopeId, limit * fetchMultiplier),
    graphSearch(config.storage, config.embedding, options.query, options.tenantId, options.scope, options.scopeId, limit * fetchMultiplier, { maxDepth: config.graphMaxDepth, maxEntities: config.graphMaxEntities }),
    matchTriggers(config.storage, config.embedding, options.query, options.tenantId, options.scope, options.scopeId),
  ]);

  // Extract results, using empty arrays for failed signals (graceful degradation)
  const vectorCandidates = vectorSettled.status === 'fulfilled' ? vectorSettled.value : [];
  const keywordCandidates = keywordSettled.status === 'fulfilled' ? keywordSettled.value : [];
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

  // 8. Lazy decay recalculation — update accessed facts (fire-and-forget)
  void updateAccessedFacts(config.storage, options.tenantId, results, {
    halfLifeDays: config.salienceHalfLifeDays ?? 30,
    normalizationK: config.salienceNormalizationK ?? 50,
  }).catch(err => console.error('[steno] Failed to update decay scores:', err));

  // 9. Record memory accesses for metamemory (fire-and-forget)
  void recordAccesses(config.storage, options.tenantId, options.query, results)
    .catch(err => console.error('[steno] Failed to record memory accesses:', err));

  return {
    results,
    triggersMatched,
    totalCandidates: allCandidates.length,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Lazy decay recalculation — update last_accessed, frequency, and decay_score
 * on all facts that were just retrieved. This ensures actively-used facts
 * maintain fresh scores without waiting for the batch recalculation job.
 */
async function updateAccessedFacts(
  storage: StorageAdapter,
  tenantId: string,
  results: SearchResult[],
  config: { halfLifeDays: number; normalizationK: number },
): Promise<void> {
  if (results.length === 0) return;

  const updates = results.map(r => ({
    id: r.fact.id,
    decayScore: calculateDecayScore({
      importance: r.fact.importance,
      frequency: r.fact.frequency + 1,
      lastAccessed: new Date(),
      halfLifeDays: config.halfLifeDays,
      normalizationK: config.normalizationK,
    }),
    lastAccessed: new Date(),
    frequency: r.fact.frequency + 1,
  }));

  await storage.updateDecayScores(tenantId, updates);
}

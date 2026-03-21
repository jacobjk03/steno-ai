import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { search } from '../../src/retrieval/search.js';
import type { SearchConfig } from '../../src/retrieval/search.js';
import { DEFAULT_FUSION_WEIGHTS } from '../../src/retrieval/types.js';
import type { SearchOptions, FusionWeights, Candidate } from '../../src/retrieval/types.js';
import type { StorageAdapter } from '../../src/adapters/storage.js';
import type { EmbeddingAdapter } from '../../src/adapters/embedding.js';
import type { Fact, Entity, Edge } from '../../src/models/index.js';

// --- Mock all sub-modules so we control their outputs ---
vi.mock('../../src/retrieval/vector-search.js', () => ({
  vectorSearch: vi.fn(),
}));
vi.mock('../../src/retrieval/keyword-search.js', () => ({
  keywordSearch: vi.fn(),
}));
vi.mock('../../src/retrieval/graph-traversal.js', () => ({
  graphSearch: vi.fn(),
}));
vi.mock('../../src/retrieval/trigger-matcher.js', () => ({
  matchTriggers: vi.fn(),
}));
vi.mock('../../src/retrieval/salience-scorer.js', () => ({
  scoreSalience: vi.fn(),
}));
vi.mock('../../src/retrieval/fusion.js', () => ({
  fuseAndRank: vi.fn(),
}));
vi.mock('../../src/retrieval/contradiction-surfacer.js', () => ({
  surfaceContradictions: vi.fn(),
}));
vi.mock('../../src/feedback/tracker.js', () => ({
  recordAccesses: vi.fn(),
}));

import { vectorSearch } from '../../src/retrieval/vector-search.js';
import { keywordSearch } from '../../src/retrieval/keyword-search.js';
import { graphSearch } from '../../src/retrieval/graph-traversal.js';
import { matchTriggers } from '../../src/retrieval/trigger-matcher.js';
import { scoreSalience } from '../../src/retrieval/salience-scorer.js';
import { fuseAndRank } from '../../src/retrieval/fusion.js';
import { surfaceContradictions } from '../../src/retrieval/contradiction-surfacer.js';
import { recordAccesses } from '../../src/feedback/tracker.js';

const mockVectorSearch = vi.mocked(vectorSearch);
const mockKeywordSearch = vi.mocked(keywordSearch);
const mockGraphSearch = vi.mocked(graphSearch);
const mockMatchTriggers = vi.mocked(matchTriggers);
const mockScoreSalience = vi.mocked(scoreSalience);
const mockFuseAndRank = vi.mocked(fuseAndRank);
const mockSurfaceContradictions = vi.mocked(surfaceContradictions);
const mockRecordAccesses = vi.mocked(recordAccesses);

// --- Helpers ---

function makeFact(overrides: Partial<Fact> = {}): Fact {
  return {
    id: 'fact-1',
    tenantId: 'tenant-1',
    scope: 'user',
    scopeId: 'user-1',
    sessionId: null,
    content: 'likes TypeScript',
    embeddingModel: 'text-embedding-3-small',
    embeddingDim: 1536,
    version: 1,
    lineageId: 'lineage-1',
    validFrom: new Date('2025-01-01'),
    validUntil: null,
    operation: 'create',
    parentId: null,
    importance: 0.8,
    frequency: 5,
    lastAccessed: new Date('2025-06-01'),
    decayScore: 0.9,
    contradictionStatus: 'none',
    contradictsId: null,
    sourceType: 'conversation',
    sourceRef: null,
    confidence: 0.9,
    originalContent: null,
    extractionId: null,
    extractionTier: null,
    modality: 'text',
    tags: [],
    metadata: {},
    createdAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function makeCandidate(
  factOverrides: Partial<Fact> = {},
  candidateOverrides: Partial<Candidate> = {},
): Candidate {
  return {
    fact: makeFact(factOverrides),
    vectorScore: 0,
    keywordScore: 0,
    graphScore: 0,
    recencyScore: 0,
    salienceScore: 0,
    source: 'vector',
    ...candidateOverrides,
  };
}

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'entity-1',
    tenantId: 'tenant-1',
    name: 'TypeScript',
    entityType: 'topic',
    canonicalName: 'typescript',
    properties: {},
    embeddingModel: null,
    embeddingDim: null,
    mergeTargetId: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function makeEdge(overrides: Partial<Edge> = {}): Edge {
  return {
    id: 'edge-1',
    tenantId: 'tenant-1',
    sourceId: 'entity-1',
    targetId: 'entity-2',
    relation: 'related_to',
    edgeType: 'associative',
    weight: 1.0,
    validFrom: new Date('2025-01-01'),
    validUntil: null,
    factId: null,
    confidence: 0.8,
    metadata: {},
    createdAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function makeSearchResult(factOverrides: Partial<Fact> = {}, resultOverrides: Partial<ReturnType<typeof makeSearchResultFull>> = {}) {
  return makeSearchResultFull(factOverrides, resultOverrides);
}

function makeSearchResultFull(factOverrides: Partial<Fact> = {}, resultOverrides: Record<string, unknown> = {}) {
  return {
    fact: makeFact(factOverrides),
    score: 0.75,
    signals: {
      vectorScore: 0.8,
      keywordScore: 0.5,
      graphScore: 0.3,
      recencyScore: 0.7,
      salienceScore: 0.6,
    },
    ...resultOverrides,
  };
}

function createMockStorage(): StorageAdapter {
  return {
    createFact: vi.fn(),
    getFact: vi.fn().mockResolvedValue(null),
    getFactsByIds: vi.fn().mockResolvedValue([]),
    getFactsByLineage: vi.fn().mockResolvedValue([]),
    getFactsByScope: vi.fn().mockResolvedValue({ data: [], cursor: null, hasMore: false }),
    invalidateFact: vi.fn(),
    purgeFacts: vi.fn(),
    updateDecayScores: vi.fn().mockResolvedValue(undefined),
    vectorSearch: vi.fn().mockResolvedValue([]),
    keywordSearch: vi.fn().mockResolvedValue([]),
    createEntity: vi.fn(),
    getEntity: vi.fn(),
    findEntityByCanonicalName: vi.fn(),
    getEntitiesForTenant: vi.fn(),
    linkFactEntity: vi.fn(),
    getEntitiesForFact: vi.fn().mockResolvedValue([]),
    getFactsForEntity: vi.fn().mockResolvedValue({ data: [], cursor: null, hasMore: false }),
    createEdge: vi.fn(),
    getEdgesForEntity: vi.fn().mockResolvedValue([]),
    graphTraversal: vi.fn(),
    createTrigger: vi.fn(),
    getTrigger: vi.fn(),
    getActiveTriggers: vi.fn().mockResolvedValue([]),
    updateTrigger: vi.fn(),
    deleteTrigger: vi.fn(),
    incrementTriggerFired: vi.fn(),
    createMemoryAccess: vi.fn().mockResolvedValue({}),
    updateFeedback: vi.fn(),
    createExtraction: vi.fn(),
    getExtraction: vi.fn(),
    updateExtraction: vi.fn(),
    getExtractionByHash: vi.fn(),
    createSession: vi.fn(),
    getSession: vi.fn(),
    endSession: vi.fn(),
    getSessionsByScope: vi.fn(),
    createTenant: vi.fn(),
    getTenant: vi.fn(),
    getTenantBySlug: vi.fn(),
    updateTenant: vi.fn(),
    createApiKey: vi.fn(),
    getApiKeyByPrefix: vi.fn(),
    getApiKeysForTenant: vi.fn(),
    revokeApiKey: vi.fn(),
    updateApiKeyLastUsed: vi.fn(),
    incrementUsage: vi.fn(),
    getUsage: vi.fn(),
    getCurrentUsage: vi.fn(),
    ping: vi.fn().mockResolvedValue(true),
  } as unknown as StorageAdapter;
}

function createMockEmbedding(): EmbeddingAdapter {
  return {
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
    model: 'test-model',
    dimensions: 3,
  };
}

function makeConfig(overrides: Partial<SearchConfig> = {}): SearchConfig {
  return {
    storage: createMockStorage(),
    embedding: createMockEmbedding(),
    ...overrides,
  };
}

function makeOptions(overrides: Partial<SearchOptions> = {}): SearchOptions {
  return {
    query: 'What does the user like?',
    tenantId: 'tenant-1',
    scope: 'user',
    scopeId: 'user-1',
    ...overrides,
  };
}

/**
 * Set up "happy path" mocks where all signals return data and the pipeline
 * processes through salience scoring, fusion, and contradiction surfacing.
 */
function setupHappyPath() {
  const vectorCandidates = [makeCandidate({ id: 'v1' }, { vectorScore: 0.9, source: 'vector' })];
  const keywordCandidates = [makeCandidate({ id: 'k1' }, { keywordScore: 0.8, source: 'keyword' })];
  const graphCandidates = [makeCandidate({ id: 'g1' }, { graphScore: 0.7, source: 'graph' })];
  const triggerCandidates = [makeCandidate({ id: 't1' }, { source: 'trigger', triggeredBy: 'trigger-abc' })];

  mockVectorSearch.mockResolvedValue(vectorCandidates);
  mockKeywordSearch.mockResolvedValue(keywordCandidates);
  mockGraphSearch.mockResolvedValue(graphCandidates);
  mockMatchTriggers.mockResolvedValue({
    candidates: triggerCandidates,
    triggersMatched: ['trigger-abc'],
  });

  const allCandidates = [...vectorCandidates, ...keywordCandidates, ...graphCandidates, ...triggerCandidates];
  // scoreSalience just passes through with recency/salience scores added
  mockScoreSalience.mockReturnValue(allCandidates.map(c => ({
    ...c,
    recencyScore: 0.5,
    salienceScore: 0.6,
  })));

  const fusionResults = allCandidates.map((c, i) => ({
    fact: c.fact,
    score: 0.9 - i * 0.1,
    signals: {
      vectorScore: c.vectorScore,
      keywordScore: c.keywordScore,
      graphScore: c.graphScore,
      recencyScore: 0.5,
      salienceScore: 0.6,
    },
    source: c.source,
    triggeredBy: c.triggeredBy,
  }));

  mockFuseAndRank.mockReturnValue(fusionResults);

  const searchResults = fusionResults.map(r => ({
    fact: r.fact,
    score: r.score,
    signals: r.signals,
    triggeredBy: r.triggeredBy,
  }));

  mockSurfaceContradictions.mockResolvedValue(searchResults);
  mockRecordAccesses.mockResolvedValue(undefined);

  return { vectorCandidates, keywordCandidates, graphCandidates, triggerCandidates, allCandidates, searchResults };
}

// --- Tests ---

describe('search orchestrator', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('full pipeline happy path', () => {
    it('query runs all 4 signals, scores salience, fuses, surfaces contradictions, and returns', async () => {
      const { allCandidates, searchResults } = setupHappyPath();
      const config = makeConfig();
      const options = makeOptions();

      const response = await search(config, options);

      // All 4 signals called
      expect(mockVectorSearch).toHaveBeenCalledOnce();
      expect(mockKeywordSearch).toHaveBeenCalledOnce();
      expect(mockGraphSearch).toHaveBeenCalledOnce();
      expect(mockMatchTriggers).toHaveBeenCalledOnce();

      // Salience scorer called with merged candidates
      expect(mockScoreSalience).toHaveBeenCalledOnce();
      const salienceArg = mockScoreSalience.mock.calls[0][0];
      expect(salienceArg).toHaveLength(allCandidates.length);

      // Fusion called
      expect(mockFuseAndRank).toHaveBeenCalledOnce();

      // Contradiction surfacer called
      expect(mockSurfaceContradictions).toHaveBeenCalledOnce();

      // Response contains results
      expect(response.results).toHaveLength(searchResults.length);
      expect(response.triggersMatched).toEqual(['trigger-abc']);
      expect(response.totalCandidates).toBe(allCandidates.length);
      expect(response.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('graceful degradation', () => {
    it('vector search fails, other signals still return results', async () => {
      const kc = [makeCandidate({ id: 'k1' }, { keywordScore: 0.8, source: 'keyword' })];
      const gc = [makeCandidate({ id: 'g1' }, { graphScore: 0.7, source: 'graph' })];

      mockVectorSearch.mockRejectedValue(new Error('embedding service down'));
      mockKeywordSearch.mockResolvedValue(kc);
      mockGraphSearch.mockResolvedValue(gc);
      mockMatchTriggers.mockResolvedValue({ candidates: [], triggersMatched: [] });

      const combined = [...kc, ...gc];
      mockScoreSalience.mockReturnValue(combined);
      mockFuseAndRank.mockReturnValue(combined.map(c => ({
        fact: c.fact,
        score: 0.5,
        signals: { vectorScore: 0, keywordScore: c.keywordScore, graphScore: c.graphScore, recencyScore: 0, salienceScore: 0 },
        source: c.source,
      })));
      mockSurfaceContradictions.mockResolvedValue(combined.map(c => ({
        fact: c.fact,
        score: 0.5,
        signals: { vectorScore: 0, keywordScore: c.keywordScore, graphScore: c.graphScore, recencyScore: 0, salienceScore: 0 },
      })));
      mockRecordAccesses.mockResolvedValue(undefined);

      const config = makeConfig();
      const response = await search(config, makeOptions());

      // Should NOT throw — graceful degradation
      expect(response.results).toHaveLength(2);
      expect(response.totalCandidates).toBe(2);
    });

    it('keyword search fails, results from vector + graph + trigger', async () => {
      const vc = [makeCandidate({ id: 'v1' }, { vectorScore: 0.9, source: 'vector' })];
      const gc = [makeCandidate({ id: 'g1' }, { graphScore: 0.7, source: 'graph' })];
      const tc = [makeCandidate({ id: 't1' }, { source: 'trigger', triggeredBy: 'trig-1' })];

      mockVectorSearch.mockResolvedValue(vc);
      mockKeywordSearch.mockRejectedValue(new Error('full-text index missing'));
      mockGraphSearch.mockResolvedValue(gc);
      mockMatchTriggers.mockResolvedValue({ candidates: tc, triggersMatched: ['trig-1'] });

      const combined = [...vc, ...gc, ...tc];
      mockScoreSalience.mockReturnValue(combined);
      mockFuseAndRank.mockReturnValue(combined.map(c => ({
        fact: c.fact,
        score: 0.5,
        signals: { vectorScore: c.vectorScore, keywordScore: 0, graphScore: c.graphScore, recencyScore: 0, salienceScore: 0 },
        source: c.source,
        triggeredBy: c.triggeredBy,
      })));
      mockSurfaceContradictions.mockResolvedValue(combined.map(c => ({
        fact: c.fact,
        score: 0.5,
        signals: { vectorScore: c.vectorScore, keywordScore: 0, graphScore: c.graphScore, recencyScore: 0, salienceScore: 0 },
        triggeredBy: c.triggeredBy,
      })));
      mockRecordAccesses.mockResolvedValue(undefined);

      const config = makeConfig();
      const response = await search(config, makeOptions());

      expect(response.results).toHaveLength(3);
      expect(response.totalCandidates).toBe(3);
      expect(response.triggersMatched).toEqual(['trig-1']);
    });

    it('all signals fail returns empty results, not an error', async () => {
      mockVectorSearch.mockRejectedValue(new Error('vector down'));
      mockKeywordSearch.mockRejectedValue(new Error('keyword down'));
      mockGraphSearch.mockRejectedValue(new Error('graph down'));
      mockMatchTriggers.mockRejectedValue(new Error('triggers down'));

      const config = makeConfig();
      const response = await search(config, makeOptions());

      expect(response.results).toEqual([]);
      expect(response.triggersMatched).toEqual([]);
      expect(response.totalCandidates).toBe(0);
      expect(response.durationMs).toBeGreaterThanOrEqual(0);

      // Fusion and scoring should not be called when there are no candidates
      expect(mockScoreSalience).not.toHaveBeenCalled();
      expect(mockFuseAndRank).not.toHaveBeenCalled();
      expect(mockSurfaceContradictions).not.toHaveBeenCalled();
    });
  });

  describe('limit handling', () => {
    it('limit is capped at 100 (pass limit=200, fusion receives max 100)', async () => {
      setupHappyPath();
      const config = makeConfig();
      const options = makeOptions({ limit: 200 });

      await search(config, options);

      // fuseAndRank should be called with limit=100 (capped)
      expect(mockFuseAndRank).toHaveBeenCalledOnce();
      const fusionLimit = mockFuseAndRank.mock.calls[0][2];
      expect(fusionLimit).toBe(100);

      // vectorSearch should be called with limit=300 (100 * 3 fetchMultiplier)
      const vectorLimit = mockVectorSearch.mock.calls[0][6];
      expect(vectorLimit).toBe(300);
    });

    it('default limit is 10', async () => {
      setupHappyPath();
      const config = makeConfig();
      const options = makeOptions(); // no limit specified

      await search(config, options);

      const fusionLimit = mockFuseAndRank.mock.calls[0][2];
      expect(fusionLimit).toBe(10);

      // vectorSearch called with 10 * 3 = 30
      const vectorLimit = mockVectorSearch.mock.calls[0][6];
      expect(vectorLimit).toBe(30);
    });
  });

  describe('weights', () => {
    it('custom weights override defaults', async () => {
      setupHappyPath();
      const customWeights: FusionWeights = {
        vector: 0.5,
        keyword: 0.1,
        graph: 0.1,
        recency: 0.2,
        salience: 0.1,
      };
      const config = makeConfig();
      const options = makeOptions({ weights: customWeights });

      await search(config, options);

      const fusionWeights = mockFuseAndRank.mock.calls[0][1];
      expect(fusionWeights).toEqual(customWeights);
    });

    it('config defaultWeights used when options.weights not provided', async () => {
      setupHappyPath();
      const configWeights: FusionWeights = {
        vector: 0.4,
        keyword: 0.2,
        graph: 0.15,
        recency: 0.15,
        salience: 0.1,
      };
      const config = makeConfig({ defaultWeights: configWeights });
      const options = makeOptions(); // no weights

      await search(config, options);

      const fusionWeights = mockFuseAndRank.mock.calls[0][1];
      expect(fusionWeights).toEqual(configWeights);
    });

    it('DEFAULT_FUSION_WEIGHTS used when neither options nor config weights provided', async () => {
      setupHappyPath();
      const config = makeConfig(); // no defaultWeights
      const options = makeOptions(); // no weights

      await search(config, options);

      const fusionWeights = mockFuseAndRank.mock.calls[0][1];
      expect(fusionWeights).toEqual(DEFAULT_FUSION_WEIGHTS);
    });
  });

  describe('response metadata', () => {
    it('triggersMatched returned in response', async () => {
      mockVectorSearch.mockResolvedValue([]);
      mockKeywordSearch.mockResolvedValue([]);
      mockGraphSearch.mockResolvedValue([]);
      mockMatchTriggers.mockResolvedValue({
        candidates: [makeCandidate({ id: 't1' }, { source: 'trigger', triggeredBy: 'trig-x' })],
        triggersMatched: ['trig-x', 'trig-y'],
      });

      const allCandidates = [makeCandidate({ id: 't1' }, { source: 'trigger', triggeredBy: 'trig-x' })];
      mockScoreSalience.mockReturnValue(allCandidates);
      mockFuseAndRank.mockReturnValue([{
        fact: allCandidates[0].fact,
        score: 0.5,
        signals: { vectorScore: 0, keywordScore: 0, graphScore: 0, recencyScore: 0, salienceScore: 0 },
        source: 'trigger',
        triggeredBy: 'trig-x',
      }]);
      mockSurfaceContradictions.mockResolvedValue([{
        fact: allCandidates[0].fact,
        score: 0.5,
        signals: { vectorScore: 0, keywordScore: 0, graphScore: 0, recencyScore: 0, salienceScore: 0 },
        triggeredBy: 'trig-x',
      }]);
      mockRecordAccesses.mockResolvedValue(undefined);

      const config = makeConfig();
      const response = await search(config, makeOptions());

      expect(response.triggersMatched).toEqual(['trig-x', 'trig-y']);
    });

    it('totalCandidates reflects pre-fusion count', async () => {
      const vc = [
        makeCandidate({ id: 'v1' }, { vectorScore: 0.9, source: 'vector' }),
        makeCandidate({ id: 'v2' }, { vectorScore: 0.8, source: 'vector' }),
      ];
      const kc = [
        makeCandidate({ id: 'k1' }, { keywordScore: 0.7, source: 'keyword' }),
      ];

      mockVectorSearch.mockResolvedValue(vc);
      mockKeywordSearch.mockResolvedValue(kc);
      mockGraphSearch.mockResolvedValue([]);
      mockMatchTriggers.mockResolvedValue({ candidates: [], triggersMatched: [] });

      const combined = [...vc, ...kc];
      mockScoreSalience.mockReturnValue(combined);
      // Fusion deduplicates and returns 2 results (v1 and v2 deduplicated with k1)
      mockFuseAndRank.mockReturnValue([
        { fact: vc[0].fact, score: 0.9, signals: { vectorScore: 0.9, keywordScore: 0, graphScore: 0, recencyScore: 0, salienceScore: 0 }, source: 'vector' },
      ]);
      mockSurfaceContradictions.mockResolvedValue([
        { fact: vc[0].fact, score: 0.9, signals: { vectorScore: 0.9, keywordScore: 0, graphScore: 0, recencyScore: 0, salienceScore: 0 } },
      ]);
      mockRecordAccesses.mockResolvedValue(undefined);

      const config = makeConfig();
      const response = await search(config, makeOptions());

      // totalCandidates is the PRE-fusion count (all candidates merged)
      expect(response.totalCandidates).toBe(3); // 2 vector + 1 keyword
      // results may be fewer after fusion/dedup
      expect(response.results).toHaveLength(1);
    });

    it('durationMs is tracked (positive number)', async () => {
      setupHappyPath();
      const config = makeConfig();
      const response = await search(config, makeOptions());

      expect(response.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof response.durationMs).toBe('number');
      expect(Number.isFinite(response.durationMs)).toBe(true);
    });
  });

  describe('graph enrichment', () => {
    it('includeGraph enriches results with entities and edges', async () => {
      const entity1 = makeEntity({ id: 'ent-1', name: 'TypeScript' });
      const entity2 = makeEntity({ id: 'ent-2', name: 'JavaScript' });
      const edge1 = makeEdge({ id: 'edge-1', sourceId: 'ent-1', targetId: 'ent-2' });

      const fact = makeFact({ id: 'fact-graph' });
      const searchResult = {
        fact,
        score: 0.8,
        signals: { vectorScore: 0.8, keywordScore: 0.5, graphScore: 0.3, recencyScore: 0.7, salienceScore: 0.6 },
      };

      mockVectorSearch.mockResolvedValue([makeCandidate({ id: 'fact-graph' }, { vectorScore: 0.9, source: 'vector' })]);
      mockKeywordSearch.mockResolvedValue([]);
      mockGraphSearch.mockResolvedValue([]);
      mockMatchTriggers.mockResolvedValue({ candidates: [], triggersMatched: [] });

      const candidates = [makeCandidate({ id: 'fact-graph' }, { vectorScore: 0.9, source: 'vector' })];
      mockScoreSalience.mockReturnValue(candidates);
      mockFuseAndRank.mockReturnValue([{
        fact,
        score: 0.8,
        signals: searchResult.signals,
        source: 'vector',
      }]);
      mockSurfaceContradictions.mockResolvedValue([searchResult]);
      mockRecordAccesses.mockResolvedValue(undefined);

      const storage = createMockStorage();
      (storage.getEntitiesForFact as ReturnType<typeof vi.fn>).mockResolvedValue([entity1, entity2]);
      (storage.getEdgesForEntity as ReturnType<typeof vi.fn>).mockImplementation((_tid: string, entityId: string) => {
        if (entityId === 'ent-1') return Promise.resolve([edge1]);
        return Promise.resolve([]);
      });

      const config = makeConfig({ storage });
      const options = makeOptions({ includeGraph: true });

      const response = await search(config, options);

      expect(response.results).toHaveLength(1);
      expect(response.results[0].graph).toBeDefined();
      expect(response.results[0].graph!.entities).toHaveLength(2);
      expect(response.results[0].graph!.entities).toEqual([entity1, entity2]);
      expect(response.results[0].graph!.edges).toContainEqual(edge1);
    });
  });

  describe('history enrichment', () => {
    it('includeHistory enriches results with fact lineage', async () => {
      const currentFact = makeFact({ id: 'fact-v3', lineageId: 'lineage-x', version: 3 });
      const historyFact1 = makeFact({ id: 'fact-v1', lineageId: 'lineage-x', version: 1 });
      const historyFact2 = makeFact({ id: 'fact-v2', lineageId: 'lineage-x', version: 2 });

      mockVectorSearch.mockResolvedValue([makeCandidate({ id: 'fact-v3', lineageId: 'lineage-x', version: 3 }, { vectorScore: 0.9, source: 'vector' })]);
      mockKeywordSearch.mockResolvedValue([]);
      mockGraphSearch.mockResolvedValue([]);
      mockMatchTriggers.mockResolvedValue({ candidates: [], triggersMatched: [] });

      const candidates = [makeCandidate({ id: 'fact-v3', lineageId: 'lineage-x', version: 3 }, { vectorScore: 0.9, source: 'vector' })];
      mockScoreSalience.mockReturnValue(candidates);
      mockFuseAndRank.mockReturnValue([{
        fact: currentFact,
        score: 0.8,
        signals: { vectorScore: 0.9, keywordScore: 0, graphScore: 0, recencyScore: 0.5, salienceScore: 0.6 },
        source: 'vector',
      }]);
      mockSurfaceContradictions.mockResolvedValue([{
        fact: currentFact,
        score: 0.8,
        signals: { vectorScore: 0.9, keywordScore: 0, graphScore: 0, recencyScore: 0.5, salienceScore: 0.6 },
      }]);
      mockRecordAccesses.mockResolvedValue(undefined);

      const storage = createMockStorage();
      // getFactsByLineage returns all versions including the current one
      (storage.getFactsByLineage as ReturnType<typeof vi.fn>).mockResolvedValue([
        currentFact,
        historyFact1,
        historyFact2,
      ]);

      const config = makeConfig({ storage });
      const options = makeOptions({ includeHistory: true });

      const response = await search(config, options);

      expect(response.results).toHaveLength(1);
      expect(response.results[0].history).toBeDefined();
      // Current fact should be filtered out; only previous versions
      expect(response.results[0].history).toHaveLength(2);
      // Sorted by version ascending
      expect(response.results[0].history![0].version).toBe(1);
      expect(response.results[0].history![1].version).toBe(2);
      expect(response.results[0].history!.every(h => h.id !== 'fact-v3')).toBe(true);
    });
  });

  describe('empty query', () => {
    it('empty query with no matches returns empty results, not error', async () => {
      mockVectorSearch.mockResolvedValue([]);
      mockKeywordSearch.mockResolvedValue([]);
      mockGraphSearch.mockResolvedValue([]);
      mockMatchTriggers.mockResolvedValue({ candidates: [], triggersMatched: [] });

      const config = makeConfig();
      const options = makeOptions({ query: '' });

      const response = await search(config, options);

      expect(response.results).toEqual([]);
      expect(response.triggersMatched).toEqual([]);
      expect(response.totalCandidates).toBe(0);
      expect(response.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('fire-and-forget operations', () => {
    it('recordAccesses receives salience config for decay recalculation', async () => {
      const fact = makeFact({ id: 'fact-decay', importance: 0.8, frequency: 5 });
      const searchResult = {
        fact,
        score: 0.8,
        signals: { vectorScore: 0.9, keywordScore: 0, graphScore: 0, recencyScore: 0.5, salienceScore: 0.6 },
      };

      mockVectorSearch.mockResolvedValue([makeCandidate({ id: 'fact-decay' }, { vectorScore: 0.9, source: 'vector' })]);
      mockKeywordSearch.mockResolvedValue([]);
      mockGraphSearch.mockResolvedValue([]);
      mockMatchTriggers.mockResolvedValue({ candidates: [], triggersMatched: [] });

      mockScoreSalience.mockReturnValue([makeCandidate({ id: 'fact-decay' }, { vectorScore: 0.9, source: 'vector' })]);
      mockFuseAndRank.mockReturnValue([{
        fact,
        score: 0.8,
        signals: searchResult.signals,
        source: 'vector',
      }]);
      mockSurfaceContradictions.mockResolvedValue([searchResult]);
      mockRecordAccesses.mockResolvedValue(undefined);

      const config = makeConfig({ salienceHalfLifeDays: 14, salienceNormalizationK: 100 });
      await search(config, makeOptions());

      // recordAccesses is called with config containing halfLifeDays and normalizationK
      await vi.waitFor(() => {
        expect(mockRecordAccesses).toHaveBeenCalled();
      });

      expect(mockRecordAccesses).toHaveBeenCalledWith(
        config.storage,
        'tenant-1',
        expect.any(String),
        [searchResult],
        {
          halfLifeDays: 14,
          normalizationK: 100,
        },
      );
    });

    it('memory access recording fires (verify createMemoryAccess called)', async () => {
      const fact = makeFact({ id: 'fact-access' });
      const searchResult = {
        fact,
        score: 0.8,
        signals: { vectorScore: 0.9, keywordScore: 0, graphScore: 0, recencyScore: 0.5, salienceScore: 0.6 },
      };

      mockVectorSearch.mockResolvedValue([makeCandidate({ id: 'fact-access' }, { vectorScore: 0.9, source: 'vector' })]);
      mockKeywordSearch.mockResolvedValue([]);
      mockGraphSearch.mockResolvedValue([]);
      mockMatchTriggers.mockResolvedValue({ candidates: [], triggersMatched: [] });

      mockScoreSalience.mockReturnValue([makeCandidate({ id: 'fact-access' }, { vectorScore: 0.9, source: 'vector' })]);
      mockFuseAndRank.mockReturnValue([{
        fact,
        score: 0.8,
        signals: searchResult.signals,
        source: 'vector',
      }]);
      mockSurfaceContradictions.mockResolvedValue([searchResult]);
      mockRecordAccesses.mockResolvedValue(undefined);

      const config = makeConfig();
      await search(config, makeOptions({ query: 'test query for access' }));

      // recordAccesses is mocked at the module level
      await vi.waitFor(() => {
        expect(mockRecordAccesses).toHaveBeenCalled();
      });

      expect(mockRecordAccesses).toHaveBeenCalledWith(
        config.storage,
        'tenant-1',
        'test query for access',
        [searchResult],
        {
          halfLifeDays: config.salienceHalfLifeDays,
          normalizationK: config.salienceNormalizationK,
        },
      );
    });

    it('error in fire-and-forget recordAccesses does not crash search (logged, not thrown)', async () => {
      const fact = makeFact({ id: 'fact-err-access' });
      const searchResult = {
        fact,
        score: 0.8,
        signals: { vectorScore: 0.9, keywordScore: 0, graphScore: 0, recencyScore: 0.5, salienceScore: 0.6 },
      };

      mockVectorSearch.mockResolvedValue([makeCandidate({ id: 'fact-err-access' }, { vectorScore: 0.9, source: 'vector' })]);
      mockKeywordSearch.mockResolvedValue([]);
      mockGraphSearch.mockResolvedValue([]);
      mockMatchTriggers.mockResolvedValue({ candidates: [], triggersMatched: [] });

      mockScoreSalience.mockReturnValue([makeCandidate({ id: 'fact-err-access' }, { vectorScore: 0.9, source: 'vector' })]);
      mockFuseAndRank.mockReturnValue([{
        fact,
        score: 0.8,
        signals: searchResult.signals,
        source: 'vector',
      }]);
      mockSurfaceContradictions.mockResolvedValue([searchResult]);
      mockRecordAccesses.mockRejectedValue(new Error('Access tracking failed'));

      const config = makeConfig();

      // Should NOT throw
      const response = await search(config, makeOptions());
      expect(response.results).toHaveLength(1);

      // Wait for the fire-and-forget promise to settle and log the error
      await vi.waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          '[steno] Failed to record memory accesses:',
          expect.any(Error),
        );
      });
    });
  });

  describe('results ordering', () => {
    it('results sorted by fused score (highest first)', async () => {
      const fact1 = makeFact({ id: 'fact-low' });
      const fact2 = makeFact({ id: 'fact-high' });
      const fact3 = makeFact({ id: 'fact-mid' });

      mockVectorSearch.mockResolvedValue([
        makeCandidate({ id: 'fact-low' }, { vectorScore: 0.3, source: 'vector' }),
        makeCandidate({ id: 'fact-high' }, { vectorScore: 0.9, source: 'vector' }),
        makeCandidate({ id: 'fact-mid' }, { vectorScore: 0.6, source: 'vector' }),
      ]);
      mockKeywordSearch.mockResolvedValue([]);
      mockGraphSearch.mockResolvedValue([]);
      mockMatchTriggers.mockResolvedValue({ candidates: [], triggersMatched: [] });

      const candidates = [
        makeCandidate({ id: 'fact-low' }, { vectorScore: 0.3, source: 'vector' }),
        makeCandidate({ id: 'fact-high' }, { vectorScore: 0.9, source: 'vector' }),
        makeCandidate({ id: 'fact-mid' }, { vectorScore: 0.6, source: 'vector' }),
      ];
      mockScoreSalience.mockReturnValue(candidates);

      // fuseAndRank returns sorted by score desc
      mockFuseAndRank.mockReturnValue([
        { fact: fact2, score: 0.9, signals: { vectorScore: 0.9, keywordScore: 0, graphScore: 0, recencyScore: 0, salienceScore: 0 }, source: 'vector' },
        { fact: fact3, score: 0.6, signals: { vectorScore: 0.6, keywordScore: 0, graphScore: 0, recencyScore: 0, salienceScore: 0 }, source: 'vector' },
        { fact: fact1, score: 0.3, signals: { vectorScore: 0.3, keywordScore: 0, graphScore: 0, recencyScore: 0, salienceScore: 0 }, source: 'vector' },
      ]);

      mockSurfaceContradictions.mockResolvedValue([
        { fact: fact2, score: 0.9, signals: { vectorScore: 0.9, keywordScore: 0, graphScore: 0, recencyScore: 0, salienceScore: 0 } },
        { fact: fact3, score: 0.6, signals: { vectorScore: 0.6, keywordScore: 0, graphScore: 0, recencyScore: 0, salienceScore: 0 } },
        { fact: fact1, score: 0.3, signals: { vectorScore: 0.3, keywordScore: 0, graphScore: 0, recencyScore: 0, salienceScore: 0 } },
      ]);
      mockRecordAccesses.mockResolvedValue(undefined);

      const config = makeConfig();
      const response = await search(config, makeOptions());

      expect(response.results).toHaveLength(3);
      expect(response.results[0].fact.id).toBe('fact-high');
      expect(response.results[1].fact.id).toBe('fact-mid');
      expect(response.results[2].fact.id).toBe('fact-low');
      expect(response.results[0].score).toBeGreaterThanOrEqual(response.results[1].score);
      expect(response.results[1].score).toBeGreaterThanOrEqual(response.results[2].score);
    });
  });

  describe('signal arguments', () => {
    it('vectorSearch receives correct arguments including temporalFilter.asOf', async () => {
      setupHappyPath();
      const asOf = new Date('2025-03-01');
      const config = makeConfig();
      const options = makeOptions({ temporalFilter: { asOf } });

      await search(config, options);

      expect(mockVectorSearch).toHaveBeenCalledWith(
        config.storage,
        config.embedding,
        options.query,
        'tenant-1',
        'user',
        'user-1',
        30, // 10 * 3
        asOf,
      );
    });

    it('graphSearch receives graphMaxDepth and graphMaxEntities from config', async () => {
      setupHappyPath();
      const config = makeConfig({ graphMaxDepth: 4, graphMaxEntities: 100 });
      const options = makeOptions();

      await search(config, options);

      expect(mockGraphSearch).toHaveBeenCalledWith(
        config.storage,
        config.embedding,
        options.query,
        'tenant-1',
        'user',
        'user-1',
        30, // 10 * 3
        { maxDepth: 4, maxEntities: 100 },
      );
    });

    it('salience scorer receives config halfLifeDays and normalizationK', async () => {
      setupHappyPath();
      const config = makeConfig({ salienceHalfLifeDays: 60, salienceNormalizationK: 100 });

      await search(config, makeOptions());

      expect(mockScoreSalience).toHaveBeenCalledOnce();
      const salienceConfig = mockScoreSalience.mock.calls[0][1];
      expect(salienceConfig).toEqual({ halfLifeDays: 60, normalizationK: 100 });
    });
  });
});

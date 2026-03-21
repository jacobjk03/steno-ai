import { describe, it, expect, vi } from 'vitest';
import { matchTriggers, evaluateCondition, cosineSimilarity } from '../../src/retrieval/trigger-matcher.js';
import type { StorageAdapter, PaginatedResult } from '../../src/adapters/storage.js';
import type { EmbeddingAdapter } from '../../src/adapters/embedding.js';
import type { Fact, Entity, Trigger } from '../../src/models/index.js';
import type { TriggerCondition } from '../../src/models/trigger.js';

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

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

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'entity-1',
    tenantId: 'tenant-1',
    name: 'Gluten',
    entityType: 'dietary_restriction',
    canonicalName: 'gluten',
    properties: {},
    embeddingModel: null,
    embeddingDim: null,
    mergeTargetId: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function makeTrigger(overrides: Partial<Trigger> = {}): Trigger {
  return {
    id: 'trigger-1',
    tenantId: 'tenant-1',
    scope: 'user',
    scopeId: 'user-1',
    condition: { keyword_any: ['food'] },
    factIds: ['fact-1'],
    entityIds: [],
    queryTemplate: null,
    priority: 0,
    active: true,
    timesFired: 0,
    lastFiredAt: null,
    createdAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function mockEmbeddingAdapter(embedFn?: (text: string) => Promise<number[]>): EmbeddingAdapter {
  return {
    embed: embedFn ?? vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
    model: 'test-model',
    dimensions: 3,
  };
}

function mockStorageAdapter(overrides: Partial<{
  getActiveTriggers: ReturnType<typeof vi.fn>;
  getFactsByIds: ReturnType<typeof vi.fn>;
  getFactsForEntity: ReturnType<typeof vi.fn>;
  getEntitiesForTenant: ReturnType<typeof vi.fn>;
  incrementTriggerFired: ReturnType<typeof vi.fn>;
}>): StorageAdapter {
  return {
    getActiveTriggers: overrides.getActiveTriggers ?? vi.fn().mockResolvedValue([]),
    getFactsByIds: overrides.getFactsByIds ?? vi.fn().mockResolvedValue([]),
    getFactsForEntity: overrides.getFactsForEntity ?? vi.fn().mockResolvedValue({ data: [], cursor: null, hasMore: false }),
    getEntitiesForTenant: overrides.getEntitiesForTenant ?? vi.fn().mockResolvedValue({ data: [], cursor: null, hasMore: false }),
    incrementTriggerFired: overrides.incrementTriggerFired ?? vi.fn().mockResolvedValue(undefined),
  } as unknown as StorageAdapter;
}

const defaultContext = (storage: StorageAdapter, embedding: EmbeddingAdapter) => ({
  storage,
  embedding,
  tenantId: 'tenant-1',
  scope: 'user',
  scopeId: 'user-1',
});

// ---------------------------------------------------------------------------
// cosineSimilarity unit tests
// ---------------------------------------------------------------------------

describe('cosineSimilarity', () => {
  it('returns 1 for identical unit vectors', () => {
    const v = [1, 0, 0];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0);
  });

  it('returns correct value for arbitrary vectors', () => {
    // a=[1,2,3], b=[4,5,6]
    // dot = 4+10+18 = 32, |a| = sqrt(14), |b| = sqrt(77)
    // cos = 32 / sqrt(14*77) = 32 / sqrt(1078)
    const expected = 32 / Math.sqrt(1078);
    expect(cosineSimilarity([1, 2, 3], [4, 5, 6])).toBeCloseTo(expected);
  });

  it('returns 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it('returns 0 for mismatched lengths', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it('returns 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// evaluateCondition tests
// ---------------------------------------------------------------------------

describe('evaluateCondition', () => {
  // topic_match
  describe('topic_match', () => {
    it('fires when query contains a topic word (case-insensitive)', async () => {
      const condition: TriggerCondition = { topic_match: ['TypeScript', 'Python'] };
      const storage = mockStorageAdapter({});
      const embedding = mockEmbeddingAdapter();

      const result = await evaluateCondition(condition, 'I love typescript so much', defaultContext(storage, embedding));
      expect(result).toBe(true);
    });

    it('does NOT fire when no match', async () => {
      const condition: TriggerCondition = { topic_match: ['Rust', 'Go'] };
      const storage = mockStorageAdapter({});
      const embedding = mockEmbeddingAdapter();

      const result = await evaluateCondition(condition, 'I love typescript', defaultContext(storage, embedding));
      expect(result).toBe(false);
    });
  });

  // keyword_any
  describe('keyword_any', () => {
    it('fires on keyword match', async () => {
      const condition: TriggerCondition = { keyword_any: ['allergic', 'allergy'] };
      const storage = mockStorageAdapter({});
      const embedding = mockEmbeddingAdapter();

      const result = await evaluateCondition(condition, 'I am allergic to peanuts', defaultContext(storage, embedding));
      expect(result).toBe(true);
    });

    it('does NOT fire when no keywords match', async () => {
      const condition: TriggerCondition = { keyword_any: ['allergic', 'allergy'] };
      const storage = mockStorageAdapter({});
      const embedding = mockEmbeddingAdapter();

      const result = await evaluateCondition(condition, 'I like peanuts', defaultContext(storage, embedding));
      expect(result).toBe(false);
    });

    it('matches case-insensitively', async () => {
      const condition: TriggerCondition = { keyword_any: ['FOOD'] };
      const storage = mockStorageAdapter({});
      const embedding = mockEmbeddingAdapter();

      const result = await evaluateCondition(condition, 'tell me about food', defaultContext(storage, embedding));
      expect(result).toBe(true);
    });
  });

  // entity_present
  describe('entity_present', () => {
    it('fires when entities of given type exist', async () => {
      const condition: TriggerCondition = { entity_present: ['dietary_restriction'] };
      const storage = mockStorageAdapter({
        getEntitiesForTenant: vi.fn().mockResolvedValue({
          data: [makeEntity({ entityType: 'dietary_restriction' })],
          cursor: null,
          hasMore: false,
        }),
      });
      const embedding = mockEmbeddingAdapter();

      const result = await evaluateCondition(condition, 'any query', defaultContext(storage, embedding));
      expect(result).toBe(true);
    });

    it('does NOT fire when no entities of type exist', async () => {
      const condition: TriggerCondition = { entity_present: ['dietary_restriction'] };
      const storage = mockStorageAdapter({
        getEntitiesForTenant: vi.fn().mockResolvedValue({
          data: [makeEntity({ entityType: 'person' })],
          cursor: null,
          hasMore: false,
        }),
      });
      const embedding = mockEmbeddingAdapter();

      const result = await evaluateCondition(condition, 'any query', defaultContext(storage, embedding));
      expect(result).toBe(false);
    });

    it('matches entity type case-insensitively', async () => {
      const condition: TriggerCondition = { entity_present: ['Dietary_Restriction'] };
      const storage = mockStorageAdapter({
        getEntitiesForTenant: vi.fn().mockResolvedValue({
          data: [makeEntity({ entityType: 'dietary_restriction' })],
          cursor: null,
          hasMore: false,
        }),
      });
      const embedding = mockEmbeddingAdapter();

      const result = await evaluateCondition(condition, 'anything', defaultContext(storage, embedding));
      expect(result).toBe(true);
    });
  });

  // semantic_similarity
  describe('semantic_similarity', () => {
    it('fires when cosine sim >= threshold', async () => {
      const condition: TriggerCondition = {
        semantic_similarity: { text: 'food preferences', threshold: 0.8 },
      };
      const storage = mockStorageAdapter({});
      // Return identical embeddings so similarity = 1.0
      const embedding = mockEmbeddingAdapter(vi.fn().mockResolvedValue([0.5, 0.5, 0.5]));

      const result = await evaluateCondition(condition, 'what are my food preferences', defaultContext(storage, embedding));
      expect(result).toBe(true);
    });

    it('does NOT fire when below threshold', async () => {
      const condition: TriggerCondition = {
        semantic_similarity: { text: 'food preferences', threshold: 0.99 },
      };
      const storage = mockStorageAdapter({});
      // Return very different embeddings
      const embedding = mockEmbeddingAdapter(
        vi.fn()
          .mockResolvedValueOnce([1, 0, 0])  // query embedding
          .mockResolvedValueOnce([0, 1, 0]),  // condition text embedding
      );

      const result = await evaluateCondition(condition, 'totally different', defaultContext(storage, embedding));
      expect(result).toBe(false);
    });

    it('fires when similarity exactly equals threshold', async () => {
      const condition: TriggerCondition = {
        semantic_similarity: { text: 'test', threshold: 1.0 },
      };
      const storage = mockStorageAdapter({});
      // Same embedding -> similarity = 1.0 = threshold
      const embedding = mockEmbeddingAdapter(vi.fn().mockResolvedValue([1, 0, 0]));

      const result = await evaluateCondition(condition, 'test', defaultContext(storage, embedding));
      expect(result).toBe(true);
    });
  });

  // AND
  describe('AND', () => {
    it('requires all sub-conditions to match', async () => {
      const condition: TriggerCondition = {
        AND: [
          { keyword_any: ['food'] },
          { keyword_any: ['allergy'] },
        ],
      };
      const storage = mockStorageAdapter({});
      const embedding = mockEmbeddingAdapter();

      // Both match
      expect(
        await evaluateCondition(condition, 'food allergy info', defaultContext(storage, embedding)),
      ).toBe(true);

      // Only one matches
      expect(
        await evaluateCondition(condition, 'food info', defaultContext(storage, embedding)),
      ).toBe(false);
    });

    it('returns false when any sub-condition fails', async () => {
      const condition: TriggerCondition = {
        AND: [
          { keyword_any: ['food'] },
          { keyword_any: ['nonexistent'] },
        ],
      };
      const storage = mockStorageAdapter({});
      const embedding = mockEmbeddingAdapter();

      const result = await evaluateCondition(condition, 'food is great', defaultContext(storage, embedding));
      expect(result).toBe(false);
    });
  });

  // OR
  describe('OR', () => {
    it('requires any sub-condition to match', async () => {
      const condition: TriggerCondition = {
        OR: [
          { keyword_any: ['food'] },
          { keyword_any: ['diet'] },
        ],
      };
      const storage = mockStorageAdapter({});
      const embedding = mockEmbeddingAdapter();

      // First matches
      expect(
        await evaluateCondition(condition, 'food is great', defaultContext(storage, embedding)),
      ).toBe(true);

      // Second matches
      expect(
        await evaluateCondition(condition, 'my diet plan', defaultContext(storage, embedding)),
      ).toBe(true);
    });

    it('returns false when no sub-condition matches', async () => {
      const condition: TriggerCondition = {
        OR: [
          { keyword_any: ['food'] },
          { keyword_any: ['diet'] },
        ],
      };
      const storage = mockStorageAdapter({});
      const embedding = mockEmbeddingAdapter();

      const result = await evaluateCondition(condition, 'weather today', defaultContext(storage, embedding));
      expect(result).toBe(false);
    });
  });

  // Nested AND(topic_match, entity_present)
  describe('nested conditions', () => {
    it('AND(topic_match, entity_present) works', async () => {
      const condition: TriggerCondition = {
        AND: [
          { topic_match: ['food'] },
          { entity_present: ['dietary_restriction'] },
        ],
      };
      const storage = mockStorageAdapter({
        getEntitiesForTenant: vi.fn().mockResolvedValue({
          data: [makeEntity({ entityType: 'dietary_restriction' })],
          cursor: null,
          hasMore: false,
        }),
      });
      const embedding = mockEmbeddingAdapter();

      // Both conditions met
      expect(
        await evaluateCondition(condition, 'tell me about food', defaultContext(storage, embedding)),
      ).toBe(true);
    });

    it('AND(topic_match, entity_present) fails when entity not present', async () => {
      const condition: TriggerCondition = {
        AND: [
          { topic_match: ['food'] },
          { entity_present: ['dietary_restriction'] },
        ],
      };
      const storage = mockStorageAdapter({
        getEntitiesForTenant: vi.fn().mockResolvedValue({
          data: [],
          cursor: null,
          hasMore: false,
        }),
      });
      const embedding = mockEmbeddingAdapter();

      expect(
        await evaluateCondition(condition, 'tell me about food', defaultContext(storage, embedding)),
      ).toBe(false);
    });
  });

  // Returns false when no condition fields set
  it('returns false for empty condition', async () => {
    const condition: TriggerCondition = {};
    const storage = mockStorageAdapter({});
    const embedding = mockEmbeddingAdapter();

    const result = await evaluateCondition(condition, 'anything', defaultContext(storage, embedding));
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// matchTriggers tests
// ---------------------------------------------------------------------------

describe('matchTriggers', () => {
  const tenantId = 'tenant-1';
  const scope = 'user';
  const scopeId = 'user-1';

  it('returns empty candidates when no triggers exist', async () => {
    const storage = mockStorageAdapter({
      getActiveTriggers: vi.fn().mockResolvedValue([]),
    });
    const embedding = mockEmbeddingAdapter();

    const result = await matchTriggers(storage, embedding, 'any query', tenantId, scope, scopeId);

    expect(result.candidates).toEqual([]);
    expect(result.triggersMatched).toEqual([]);
  });

  it('surfaces factIds from matched trigger (batch fetched)', async () => {
    const fact1 = makeFact({ id: 'fact-1', content: 'likes pizza' });
    const fact2 = makeFact({ id: 'fact-2', content: 'allergic to gluten' });
    const trigger = makeTrigger({
      id: 'trigger-1',
      condition: { keyword_any: ['food'] },
      factIds: ['fact-1', 'fact-2'],
      entityIds: [],
    });

    const storage = mockStorageAdapter({
      getActiveTriggers: vi.fn().mockResolvedValue([trigger]),
      getFactsByIds: vi.fn().mockResolvedValue([fact1, fact2]),
      incrementTriggerFired: vi.fn().mockResolvedValue(undefined),
    });
    const embedding = mockEmbeddingAdapter();

    const result = await matchTriggers(storage, embedding, 'food preferences', tenantId, scope, scopeId);

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]!.fact).toBe(fact1);
    expect(result.candidates[1]!.fact).toBe(fact2);
    expect(result.triggersMatched).toEqual(['trigger-1']);
  });

  it('surfaces facts for entityIds from matched trigger', async () => {
    const fact1 = makeFact({ id: 'fact-e1', content: 'entity fact 1' });
    const trigger = makeTrigger({
      id: 'trigger-1',
      condition: { keyword_any: ['food'] },
      factIds: [],
      entityIds: ['entity-1'],
    });

    const storage = mockStorageAdapter({
      getActiveTriggers: vi.fn().mockResolvedValue([trigger]),
      getFactsForEntity: vi.fn().mockResolvedValue({
        data: [fact1],
        cursor: null,
        hasMore: false,
      }),
      incrementTriggerFired: vi.fn().mockResolvedValue(undefined),
    });
    const embedding = mockEmbeddingAdapter();

    const result = await matchTriggers(storage, embedding, 'food info', tenantId, scope, scopeId);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.fact).toBe(fact1);
    expect(result.candidates[0]!.source).toBe('trigger');
    expect(result.candidates[0]!.triggeredBy).toBe('trigger-1');
  });

  it('filters out expired facts (validUntil !== null)', async () => {
    const validFact = makeFact({ id: 'fact-valid', validUntil: null });
    const expiredFact = makeFact({ id: 'fact-expired', validUntil: new Date('2025-01-01') });
    const trigger = makeTrigger({
      id: 'trigger-1',
      condition: { keyword_any: ['test'] },
      factIds: ['fact-valid', 'fact-expired'],
    });

    const storage = mockStorageAdapter({
      getActiveTriggers: vi.fn().mockResolvedValue([trigger]),
      getFactsByIds: vi.fn().mockResolvedValue([validFact, expiredFact]),
      incrementTriggerFired: vi.fn().mockResolvedValue(undefined),
    });
    const embedding = mockEmbeddingAdapter();

    const result = await matchTriggers(storage, embedding, 'test query', tenantId, scope, scopeId);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.fact.id).toBe('fact-valid');
  });

  it('filters out expired facts from entityIds too', async () => {
    const validFact = makeFact({ id: 'fact-v', validUntil: null });
    const expiredFact = makeFact({ id: 'fact-e', validUntil: new Date('2025-06-01') });
    const trigger = makeTrigger({
      id: 'trigger-1',
      condition: { keyword_any: ['test'] },
      factIds: [],
      entityIds: ['entity-1'],
    });

    const storage = mockStorageAdapter({
      getActiveTriggers: vi.fn().mockResolvedValue([trigger]),
      getFactsForEntity: vi.fn().mockResolvedValue({
        data: [validFact, expiredFact],
        cursor: null,
        hasMore: false,
      }),
      incrementTriggerFired: vi.fn().mockResolvedValue(undefined),
    });
    const embedding = mockEmbeddingAdapter();

    const result = await matchTriggers(storage, embedding, 'test stuff', tenantId, scope, scopeId);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.fact.id).toBe('fact-v');
  });

  it('increments trigger fire count on match', async () => {
    const trigger = makeTrigger({
      id: 'trigger-inc',
      condition: { keyword_any: ['match'] },
      factIds: [],
      entityIds: [],
    });
    const incrementFn = vi.fn().mockResolvedValue(undefined);

    const storage = mockStorageAdapter({
      getActiveTriggers: vi.fn().mockResolvedValue([trigger]),
      incrementTriggerFired: incrementFn,
    });
    const embedding = mockEmbeddingAdapter();

    await matchTriggers(storage, embedding, 'match me', tenantId, scope, scopeId);

    // incrementTriggerFired is fire-and-forget, but it should be called
    expect(incrementFn).toHaveBeenCalledWith(tenantId, 'trigger-inc');
  });

  it('does not increment trigger fire count when no match', async () => {
    const trigger = makeTrigger({
      id: 'trigger-no',
      condition: { keyword_any: ['nope'] },
      factIds: [],
      entityIds: [],
    });
    const incrementFn = vi.fn().mockResolvedValue(undefined);

    const storage = mockStorageAdapter({
      getActiveTriggers: vi.fn().mockResolvedValue([trigger]),
      incrementTriggerFired: incrementFn,
    });
    const embedding = mockEmbeddingAdapter();

    await matchTriggers(storage, embedding, 'unrelated query', tenantId, scope, scopeId);

    expect(incrementFn).not.toHaveBeenCalled();
  });

  it('processes triggers in priority order (highest first)', async () => {
    const lowPriorityFact = makeFact({ id: 'fact-low', content: 'low priority' });
    const highPriorityFact = makeFact({ id: 'fact-high', content: 'high priority' });

    // Storage returns triggers already sorted by priority DESC
    const triggers = [
      makeTrigger({
        id: 'trigger-high',
        condition: { keyword_any: ['test'] },
        factIds: ['fact-high'],
        priority: 10,
      }),
      makeTrigger({
        id: 'trigger-low',
        condition: { keyword_any: ['test'] },
        factIds: ['fact-low'],
        priority: 1,
      }),
    ];

    const getFactsByIdsFn = vi.fn()
      .mockResolvedValueOnce([highPriorityFact])
      .mockResolvedValueOnce([lowPriorityFact]);

    const storage = mockStorageAdapter({
      getActiveTriggers: vi.fn().mockResolvedValue(triggers),
      getFactsByIds: getFactsByIdsFn,
      incrementTriggerFired: vi.fn().mockResolvedValue(undefined),
    });
    const embedding = mockEmbeddingAdapter();

    const result = await matchTriggers(storage, embedding, 'test query', tenantId, scope, scopeId);

    // High-priority trigger's facts come first
    expect(result.candidates[0]!.fact.id).toBe('fact-high');
    expect(result.candidates[1]!.fact.id).toBe('fact-low');
    expect(result.triggersMatched).toEqual(['trigger-high', 'trigger-low']);
  });

  it('sets all signal scores to 0 for trigger candidates', async () => {
    const fact = makeFact({ id: 'fact-1' });
    const trigger = makeTrigger({
      condition: { keyword_any: ['test'] },
      factIds: ['fact-1'],
    });

    const storage = mockStorageAdapter({
      getActiveTriggers: vi.fn().mockResolvedValue([trigger]),
      getFactsByIds: vi.fn().mockResolvedValue([fact]),
      incrementTriggerFired: vi.fn().mockResolvedValue(undefined),
    });
    const embedding = mockEmbeddingAdapter();

    const result = await matchTriggers(storage, embedding, 'test query', tenantId, scope, scopeId);

    const candidate = result.candidates[0]!;
    expect(candidate.vectorScore).toBe(0);
    expect(candidate.keywordScore).toBe(0);
    expect(candidate.graphScore).toBe(0);
    expect(candidate.recencyScore).toBe(0);
    expect(candidate.salienceScore).toBe(0);
    expect(candidate.source).toBe('trigger');
  });

  it('does not call getFactsByIds when trigger has no factIds', async () => {
    const trigger = makeTrigger({
      condition: { keyword_any: ['test'] },
      factIds: [],
      entityIds: [],
    });
    const getFactsByIdsFn = vi.fn();

    const storage = mockStorageAdapter({
      getActiveTriggers: vi.fn().mockResolvedValue([trigger]),
      getFactsByIds: getFactsByIdsFn,
      incrementTriggerFired: vi.fn().mockResolvedValue(undefined),
    });
    const embedding = mockEmbeddingAdapter();

    await matchTriggers(storage, embedding, 'test query', tenantId, scope, scopeId);

    expect(getFactsByIdsFn).not.toHaveBeenCalled();
  });

  it('does not call getFactsForEntity when trigger has no entityIds', async () => {
    const trigger = makeTrigger({
      condition: { keyword_any: ['test'] },
      factIds: [],
      entityIds: [],
    });
    const getFactsForEntityFn = vi.fn();

    const storage = mockStorageAdapter({
      getActiveTriggers: vi.fn().mockResolvedValue([trigger]),
      getFactsForEntity: getFactsForEntityFn,
      incrementTriggerFired: vi.fn().mockResolvedValue(undefined),
    });
    const embedding = mockEmbeddingAdapter();

    await matchTriggers(storage, embedding, 'test query', tenantId, scope, scopeId);

    expect(getFactsForEntityFn).not.toHaveBeenCalled();
  });

  it('handles incrementTriggerFired failure gracefully', async () => {
    const fact = makeFact({ id: 'fact-1' });
    const trigger = makeTrigger({
      condition: { keyword_any: ['test'] },
      factIds: ['fact-1'],
    });

    const storage = mockStorageAdapter({
      getActiveTriggers: vi.fn().mockResolvedValue([trigger]),
      getFactsByIds: vi.fn().mockResolvedValue([fact]),
      incrementTriggerFired: vi.fn().mockRejectedValue(new Error('DB error')),
    });
    const embedding = mockEmbeddingAdapter();

    // Should not throw even though incrementTriggerFired fails
    const result = await matchTriggers(storage, embedding, 'test query', tenantId, scope, scopeId);
    expect(result.candidates).toHaveLength(1);
  });
});

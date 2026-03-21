import { describe, it, expect, vi, beforeEach } from 'vitest';
import { graphSearch, tokenizeQuery } from '../../src/retrieval/graph-traversal.js';
import type { StorageAdapter } from '../../src/adapters/storage.js';
import type { EmbeddingAdapter } from '../../src/adapters/embedding.js';
import type { Entity } from '../../src/models/entity.js';
import type { Edge } from '../../src/models/edge.js';
import type { Fact } from '../../src/models/fact.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const SCOPE = 'user';
const SCOPE_ID = 'user-1';

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: '00000000-0000-0000-0000-000000000010',
    tenantId: TENANT_ID,
    name: 'Alice',
    entityType: 'person',
    canonicalName: 'alice',
    properties: {},
    embeddingModel: null,
    embeddingDim: null,
    mergeTargetId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeEdge(overrides: Partial<Edge> = {}): Edge {
  return {
    id: '00000000-0000-0000-0000-000000000020',
    tenantId: TENANT_ID,
    sourceId: '00000000-0000-0000-0000-000000000010',
    targetId: '00000000-0000-0000-0000-000000000011',
    relation: 'knows',
    edgeType: 'associative',
    weight: 1.0,
    validFrom: new Date(),
    validUntil: null,
    factId: null,
    confidence: 0.9,
    metadata: {},
    createdAt: new Date(),
    ...overrides,
  };
}

function makeFact(overrides: Partial<Fact> = {}): Fact {
  return {
    id: '00000000-0000-0000-0000-000000000030',
    tenantId: TENANT_ID,
    scope: 'user',
    scopeId: SCOPE_ID,
    sessionId: null,
    content: 'Alice likes coffee',
    embeddingModel: 'text-embedding-3-small',
    embeddingDim: 1536,
    version: 1,
    lineageId: '00000000-0000-0000-0000-000000000030',
    validFrom: new Date(),
    validUntil: null,
    operation: 'create',
    parentId: null,
    importance: 0.5,
    frequency: 1,
    lastAccessed: new Date(),
    decayScore: 0.5,
    contradictionStatus: 'none',
    contradictsId: null,
    sourceType: 'conversation',
    sourceRef: null,
    confidence: 0.8,
    originalContent: null,
    extractionId: null,
    extractionTier: null,
    modality: 'text',
    tags: [],
    metadata: {},
    createdAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock adapters
// ---------------------------------------------------------------------------

function createMockStorage(): StorageAdapter {
  return {
    findEntityByCanonicalName: vi.fn().mockResolvedValue(null),
    graphTraversal: vi.fn().mockResolvedValue({ entities: [], edges: [] }),
    getFactsForEntity: vi.fn().mockResolvedValue({ data: [], cursor: null, hasMore: false }),
    getEntitiesForFact: vi.fn().mockResolvedValue([]),
    // All other methods as no-op stubs
    createFact: vi.fn(),
    getFact: vi.fn(),
    getFactsByIds: vi.fn(),
    getFactsByLineage: vi.fn(),
    getFactsByScope: vi.fn(),
    invalidateFact: vi.fn(),
    purgeFacts: vi.fn(),
    updateDecayScores: vi.fn(),
    vectorSearch: vi.fn(),
    keywordSearch: vi.fn(),
    createEntity: vi.fn(),
    getEntity: vi.fn(),
    getEntitiesForTenant: vi.fn(),
    linkFactEntity: vi.fn(),
    createEdge: vi.fn(),
    getEdgesForEntity: vi.fn(),
    createTrigger: vi.fn(),
    getTrigger: vi.fn(),
    getActiveTriggers: vi.fn(),
    updateTrigger: vi.fn(),
    deleteTrigger: vi.fn(),
    incrementTriggerFired: vi.fn(),
    createMemoryAccess: vi.fn(),
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
    ping: vi.fn(),
  } as unknown as StorageAdapter;
}

function createMockEmbedding(): EmbeddingAdapter {
  return {
    embed: vi.fn().mockResolvedValue(new Array(1536).fill(0)),
    embedBatch: vi.fn().mockResolvedValue([]),
    model: 'test-model',
    dimensions: 1536,
  };
}

// ---------------------------------------------------------------------------
// Tests: tokenizeQuery
// ---------------------------------------------------------------------------

describe('tokenizeQuery', () => {
  it('splits on whitespace and lowercases', () => {
    expect(tokenizeQuery('Alice Bob Charlie')).toEqual(['alice', 'bob', 'charlie']);
  });

  it('filters tokens shorter than 3 characters', () => {
    expect(tokenizeQuery('I am at the park')).toEqual(['the', 'park']);
  });

  it('removes non-word characters except hyphens', () => {
    expect(tokenizeQuery('Alice! Bob? (Charlie)')).toEqual(['alice', 'bob', 'charlie']);
  });

  it('returns empty array for empty input', () => {
    expect(tokenizeQuery('')).toEqual([]);
  });

  it('returns empty array when all tokens are too short', () => {
    expect(tokenizeQuery('I am a')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: graphSearch
// ---------------------------------------------------------------------------

describe('graphSearch', () => {
  let storage: StorageAdapter;
  let embedding: EmbeddingAdapter;

  beforeEach(() => {
    storage = createMockStorage();
    embedding = createMockEmbedding();
  });

  it('returns empty candidates when no tokens match entities', async () => {
    const candidates = await graphSearch(
      storage, embedding, 'Alice Bob', TENANT_ID, SCOPE, SCOPE_ID, 10,
    );
    expect(candidates).toEqual([]);
    // Should have tried to find entities for each token/type combo
    expect(storage.findEntityByCanonicalName).toHaveBeenCalled();
  });

  it('returns empty candidates when query has no valid tokens', async () => {
    const candidates = await graphSearch(
      storage, embedding, 'I a', TENANT_ID, SCOPE, SCOPE_ID, 10,
    );
    expect(candidates).toEqual([]);
    expect(storage.findEntityByCanonicalName).not.toHaveBeenCalled();
  });

  it('finds seed entities from query tokens and calls graphTraversal', async () => {
    const alice = makeEntity({ id: 'ent-alice', canonicalName: 'alice' });

    vi.mocked(storage.findEntityByCanonicalName).mockImplementation(
      async (_tenantId, name, type) => {
        if (name === 'alice' && type === 'person') return alice;
        return null;
      },
    );
    vi.mocked(storage.graphTraversal).mockResolvedValue({
      entities: [alice],
      edges: [],
    });
    vi.mocked(storage.getFactsForEntity).mockResolvedValue({
      data: [makeFact({ id: 'fact-1', content: 'Alice likes coffee' })],
      cursor: null,
      hasMore: false,
    });

    const candidates = await graphSearch(
      storage, embedding, 'Tell me about Alice', TENANT_ID, SCOPE, SCOPE_ID, 10,
    );

    expect(storage.graphTraversal).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      entityIds: ['ent-alice'],
      maxDepth: 3,
      maxEntities: 200,
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].fact.id).toBe('fact-1');
    expect(candidates[0].source).toBe('graph');
  });

  it('assigns decreasing scores by hop depth: 1.0, 0.5, 0.25', async () => {
    const alice = makeEntity({ id: 'ent-alice', canonicalName: 'alice' });
    const bob = makeEntity({ id: 'ent-bob', name: 'Bob', canonicalName: 'bob', entityType: 'person' });
    const charlie = makeEntity({ id: 'ent-charlie', name: 'Charlie', canonicalName: 'charlie', entityType: 'person' });

    vi.mocked(storage.findEntityByCanonicalName).mockImplementation(
      async (_tenantId, name, type) => {
        if (name === 'alice' && type === 'person') return alice;
        return null;
      },
    );

    // Alice (seed, hop 0) -> Bob (hop 1) -> Charlie (hop 2)
    vi.mocked(storage.graphTraversal).mockResolvedValue({
      entities: [alice, bob, charlie],
      edges: [
        makeEdge({ id: 'edge-ab', sourceId: 'ent-alice', targetId: 'ent-bob' }),
        makeEdge({ id: 'edge-bc', sourceId: 'ent-bob', targetId: 'ent-charlie' }),
      ],
    });

    const factAlice = makeFact({ id: 'fact-alice', content: 'Alice fact' });
    const factBob = makeFact({ id: 'fact-bob', content: 'Bob fact' });
    const factCharlie = makeFact({ id: 'fact-charlie', content: 'Charlie fact' });

    vi.mocked(storage.getFactsForEntity).mockImplementation(
      async (_tenantId, entityId) => {
        if (entityId === 'ent-alice') return { data: [factAlice], cursor: null, hasMore: false };
        if (entityId === 'ent-bob') return { data: [factBob], cursor: null, hasMore: false };
        if (entityId === 'ent-charlie') return { data: [factCharlie], cursor: null, hasMore: false };
        return { data: [], cursor: null, hasMore: false };
      },
    );

    const candidates = await graphSearch(
      storage, embedding, 'Alice', TENANT_ID, SCOPE, SCOPE_ID, 10,
    );

    expect(candidates).toHaveLength(3);
    // Sort by score descending (already done by graphSearch)
    expect(candidates[0].graphScore).toBe(1.0);   // hop 0: 1/2^0
    expect(candidates[1].graphScore).toBe(0.5);    // hop 1: 1/2^1
    expect(candidates[2].graphScore).toBe(0.25);   // hop 2: 1/2^2
  });

  it('respects maxDepth default of 3', async () => {
    const alice = makeEntity({ id: 'ent-alice', canonicalName: 'alice' });

    vi.mocked(storage.findEntityByCanonicalName).mockImplementation(
      async (_tenantId, name, type) => {
        if (name === 'alice' && type === 'person') return alice;
        return null;
      },
    );
    vi.mocked(storage.graphTraversal).mockResolvedValue({ entities: [alice], edges: [] });
    vi.mocked(storage.getFactsForEntity).mockResolvedValue({ data: [], cursor: null, hasMore: false });

    await graphSearch(storage, embedding, 'Alice', TENANT_ID, SCOPE, SCOPE_ID, 10);

    expect(storage.graphTraversal).toHaveBeenCalledWith(
      expect.objectContaining({ maxDepth: 3 }),
    );
  });

  it('clamps maxDepth to 5', async () => {
    const alice = makeEntity({ id: 'ent-alice', canonicalName: 'alice' });

    vi.mocked(storage.findEntityByCanonicalName).mockImplementation(
      async (_tenantId, name, type) => {
        if (name === 'alice' && type === 'person') return alice;
        return null;
      },
    );
    vi.mocked(storage.graphTraversal).mockResolvedValue({ entities: [alice], edges: [] });
    vi.mocked(storage.getFactsForEntity).mockResolvedValue({ data: [], cursor: null, hasMore: false });

    await graphSearch(
      storage, embedding, 'Alice', TENANT_ID, SCOPE, SCOPE_ID, 10,
      { maxDepth: 10 },
    );

    expect(storage.graphTraversal).toHaveBeenCalledWith(
      expect.objectContaining({ maxDepth: 5 }),
    );
  });

  it('respects maxEntities default of 200', async () => {
    const alice = makeEntity({ id: 'ent-alice', canonicalName: 'alice' });

    vi.mocked(storage.findEntityByCanonicalName).mockImplementation(
      async (_tenantId, name, type) => {
        if (name === 'alice' && type === 'person') return alice;
        return null;
      },
    );
    vi.mocked(storage.graphTraversal).mockResolvedValue({ entities: [alice], edges: [] });
    vi.mocked(storage.getFactsForEntity).mockResolvedValue({ data: [], cursor: null, hasMore: false });

    await graphSearch(storage, embedding, 'Alice', TENANT_ID, SCOPE, SCOPE_ID, 10);

    expect(storage.graphTraversal).toHaveBeenCalledWith(
      expect.objectContaining({ maxEntities: 200 }),
    );
  });

  it('passes custom maxEntities', async () => {
    const alice = makeEntity({ id: 'ent-alice', canonicalName: 'alice' });

    vi.mocked(storage.findEntityByCanonicalName).mockImplementation(
      async (_tenantId, name, type) => {
        if (name === 'alice' && type === 'person') return alice;
        return null;
      },
    );
    vi.mocked(storage.graphTraversal).mockResolvedValue({ entities: [alice], edges: [] });
    vi.mocked(storage.getFactsForEntity).mockResolvedValue({ data: [], cursor: null, hasMore: false });

    await graphSearch(
      storage, embedding, 'Alice', TENANT_ID, SCOPE, SCOPE_ID, 10,
      { maxEntities: 50 },
    );

    expect(storage.graphTraversal).toHaveBeenCalledWith(
      expect.objectContaining({ maxEntities: 50 }),
    );
  });

  it('returns empty candidates when graph traversal returns empty result', async () => {
    const alice = makeEntity({ id: 'ent-alice', canonicalName: 'alice' });

    vi.mocked(storage.findEntityByCanonicalName).mockImplementation(
      async (_tenantId, name, type) => {
        if (name === 'alice' && type === 'person') return alice;
        return null;
      },
    );
    vi.mocked(storage.graphTraversal).mockResolvedValue({ entities: [], edges: [] });

    const candidates = await graphSearch(
      storage, embedding, 'Alice', TENANT_ID, SCOPE, SCOPE_ID, 10,
    );

    expect(candidates).toEqual([]);
  });

  it('deduplicates facts seen from multiple paths', async () => {
    const alice = makeEntity({ id: 'ent-alice', canonicalName: 'alice' });
    const bob = makeEntity({ id: 'ent-bob', name: 'Bob', canonicalName: 'bob', entityType: 'person' });
    const sharedFact = makeFact({ id: 'shared-fact', content: 'Alice and Bob went hiking' });

    vi.mocked(storage.findEntityByCanonicalName).mockImplementation(
      async (_tenantId, name, type) => {
        if (name === 'alice' && type === 'person') return alice;
        return null;
      },
    );

    vi.mocked(storage.graphTraversal).mockResolvedValue({
      entities: [alice, bob],
      edges: [makeEdge({ id: 'edge-ab', sourceId: 'ent-alice', targetId: 'ent-bob' })],
    });

    // Both entities return the same fact
    vi.mocked(storage.getFactsForEntity).mockResolvedValue({
      data: [sharedFact],
      cursor: null,
      hasMore: false,
    });

    const candidates = await graphSearch(
      storage, embedding, 'Alice', TENANT_ID, SCOPE, SCOPE_ID, 10,
    );

    // Should be deduplicated to 1 candidate
    expect(candidates).toHaveLength(1);
    expect(candidates[0].fact.id).toBe('shared-fact');
    // Should keep the highest score (from Alice at hop 0 = 1.0)
    expect(candidates[0].graphScore).toBe(1.0);
  });

  it('limits results to the requested limit', async () => {
    const alice = makeEntity({ id: 'ent-alice', canonicalName: 'alice' });

    vi.mocked(storage.findEntityByCanonicalName).mockImplementation(
      async (_tenantId, name, type) => {
        if (name === 'alice' && type === 'person') return alice;
        return null;
      },
    );

    vi.mocked(storage.graphTraversal).mockResolvedValue({
      entities: [alice],
      edges: [],
    });

    // Return 5 facts
    vi.mocked(storage.getFactsForEntity).mockResolvedValue({
      data: [
        makeFact({ id: 'f1' }),
        makeFact({ id: 'f2' }),
        makeFact({ id: 'f3' }),
        makeFact({ id: 'f4' }),
        makeFact({ id: 'f5' }),
      ],
      cursor: null,
      hasMore: false,
    });

    const candidates = await graphSearch(
      storage, embedding, 'Alice', TENANT_ID, SCOPE, SCOPE_ID, 2,
    );

    expect(candidates).toHaveLength(2);
  });

  it('all candidates have source set to graph', async () => {
    const alice = makeEntity({ id: 'ent-alice', canonicalName: 'alice' });

    vi.mocked(storage.findEntityByCanonicalName).mockImplementation(
      async (_tenantId, name, type) => {
        if (name === 'alice' && type === 'person') return alice;
        return null;
      },
    );

    vi.mocked(storage.graphTraversal).mockResolvedValue({
      entities: [alice],
      edges: [],
    });

    vi.mocked(storage.getFactsForEntity).mockResolvedValue({
      data: [makeFact({ id: 'f1' })],
      cursor: null,
      hasMore: false,
    });

    const candidates = await graphSearch(
      storage, embedding, 'Alice', TENANT_ID, SCOPE, SCOPE_ID, 10,
    );

    for (const c of candidates) {
      expect(c.source).toBe('graph');
      expect(c.vectorScore).toBe(0);
      expect(c.keywordScore).toBe(0);
      expect(c.recencyScore).toBe(0);
      expect(c.salienceScore).toBe(0);
    }
  });

  it('searches multiple entity types for each token', async () => {
    await graphSearch(
      storage, embedding, 'Alice', TENANT_ID, SCOPE, SCOPE_ID, 10,
    );

    // Should have called findEntityByCanonicalName for 'alice' with multiple types
    const calls = vi.mocked(storage.findEntityByCanonicalName).mock.calls;
    const types = calls.map(([, , t]) => t);
    expect(types).toContain('person');
    expect(types).toContain('organization');
    expect(types).toContain('location');
  });

  it('does not add duplicate seed entity IDs', async () => {
    const alice = makeEntity({ id: 'ent-alice', canonicalName: 'alice' });

    // Same entity returned for two different entity types
    vi.mocked(storage.findEntityByCanonicalName).mockImplementation(
      async (_tenantId, name, type) => {
        if (name === 'alice' && (type === 'person' || type === 'concept')) return alice;
        return null;
      },
    );
    vi.mocked(storage.graphTraversal).mockResolvedValue({ entities: [alice], edges: [] });
    vi.mocked(storage.getFactsForEntity).mockResolvedValue({ data: [], cursor: null, hasMore: false });

    await graphSearch(storage, embedding, 'Alice', TENANT_ID, SCOPE, SCOPE_ID, 10);

    // graphTraversal should be called with a single entity ID (deduplicated)
    const call = vi.mocked(storage.graphTraversal).mock.calls[0][0];
    expect(call.entityIds).toEqual(['ent-alice']);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { persistEntitiesAndEdges } from '../../src/extraction/entity-extractor.js';
import type { StorageAdapter } from '../../src/adapters/storage.js';
import type { EmbeddingAdapter } from '../../src/adapters/embedding.js';
import type { Entity, Edge } from '../../src/models/index.js';
import type { ExtractedEntity, ExtractedEdge } from '../../src/extraction/types.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeMockStorage(overrides: Partial<StorageAdapter> = {}): StorageAdapter {
  return {
    // Facts
    createFact: vi.fn(),
    getFact: vi.fn(),
    getFactsByLineage: vi.fn(),
    getFactsByScope: vi.fn(),
    invalidateFact: vi.fn(),
    purgeFacts: vi.fn(),
    updateDecayScores: vi.fn(),

    // Vector / keyword search
    vectorSearch: vi.fn(),
    keywordSearch: vi.fn(),

    // Entities
    createEntity: vi.fn().mockResolvedValue({} as Entity),
    getEntity: vi.fn(),
    findEntityByCanonicalName: vi.fn().mockResolvedValue(null),
    getEntitiesForTenant: vi.fn(),

    // Fact-Entity junction
    linkFactEntity: vi.fn().mockResolvedValue(undefined),
    getEntitiesForFact: vi.fn(),
    getFactsForEntity: vi.fn(),

    // Edges
    createEdge: vi.fn().mockResolvedValue({} as Edge),
    getEdgesForEntity: vi.fn(),
    graphTraversal: vi.fn(),

    // Triggers
    createTrigger: vi.fn(),
    getTrigger: vi.fn(),
    getActiveTriggers: vi.fn(),
    updateTrigger: vi.fn(),
    deleteTrigger: vi.fn(),
    incrementTriggerFired: vi.fn(),

    // Memory Access
    createMemoryAccess: vi.fn(),
    updateFeedback: vi.fn(),

    // Extractions
    createExtraction: vi.fn(),
    getExtraction: vi.fn(),
    updateExtraction: vi.fn(),
    getExtractionByHash: vi.fn(),

    // Sessions
    createSession: vi.fn(),
    getSession: vi.fn(),
    endSession: vi.fn(),
    getSessionsByScope: vi.fn(),

    // Tenants
    createTenant: vi.fn(),
    getTenant: vi.fn(),
    getTenantBySlug: vi.fn(),
    updateTenant: vi.fn(),

    // API Keys
    createApiKey: vi.fn(),
    getApiKeyByPrefix: vi.fn(),
    getApiKeysForTenant: vi.fn(),
    revokeApiKey: vi.fn(),
    updateApiKeyLastUsed: vi.fn(),

    // Usage
    incrementUsage: vi.fn(),
    getUsage: vi.fn(),
    getCurrentUsage: vi.fn(),

    // Health
    ping: vi.fn(),

    ...overrides,
  } as unknown as StorageAdapter;
}

function makeMockEmbedding(overrides: Partial<EmbeddingAdapter> = {}): EmbeddingAdapter {
  return {
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
    model: 'test-embedding-model',
    dimensions: 3,
    ...overrides,
  } as EmbeddingAdapter;
}

function makeEntity(
  overrides: Partial<ExtractedEntity> = {},
): ExtractedEntity {
  return {
    name: 'Alice Smith',
    entityType: 'person',
    canonicalName: 'alice smith',
    properties: {},
    ...overrides,
  };
}

function makeEdge(overrides: Partial<ExtractedEdge> = {}): ExtractedEdge {
  return {
    sourceName: 'alice smith',
    targetName: 'acme corp',
    relation: 'works_at',
    edgeType: 'associative',
    confidence: 0.9,
    ...overrides,
  };
}

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const FACT_ID = '00000000-0000-0000-0000-000000000002';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('persistEntitiesAndEdges – entity creation', () => {
  it('creates a new entity when findEntityByCanonicalName returns null', async () => {
    const storage = makeMockStorage();
    const embedding = makeMockEmbedding();
    const entity = makeEntity();

    await persistEntitiesAndEdges(storage, embedding, TENANT_ID, FACT_ID, [entity], []);

    expect(storage.findEntityByCanonicalName).toHaveBeenCalledWith(
      TENANT_ID,
      entity.canonicalName,
      entity.entityType,
    );
    expect(storage.createEntity).toHaveBeenCalledOnce();
    const createCall = vi.mocked(storage.createEntity).mock.calls[0][0];
    expect(createCall.canonicalName).toBe(entity.canonicalName);
    expect(createCall.tenantId).toBe(TENANT_ID);
  });

  it('does NOT call createEntity when entity already exists', async () => {
    const existingEntity: Entity = {
      id: 'existing-id-0000-0000-0000-000000000003',
      tenantId: TENANT_ID,
      name: 'Alice Smith',
      entityType: 'person',
      canonicalName: 'alice smith',
      properties: {},
      embeddingModel: 'test-model',
      embeddingDim: 3,
      mergeTargetId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const storage = makeMockStorage({
      findEntityByCanonicalName: vi.fn().mockResolvedValue(existingEntity),
    });
    const embedding = makeMockEmbedding();

    await persistEntitiesAndEdges(storage, embedding, TENANT_ID, FACT_ID, [makeEntity()], []);

    expect(storage.createEntity).not.toHaveBeenCalled();
  });

  it('reuses existing entity ID from DB', async () => {
    const existingId = 'aaaaaaaa-0000-0000-0000-000000000000';
    const existingEntity: Entity = {
      id: existingId,
      tenantId: TENANT_ID,
      name: 'Alice Smith',
      entityType: 'person',
      canonicalName: 'alice smith',
      properties: {},
      embeddingModel: 'test-model',
      embeddingDim: 3,
      mergeTargetId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const storage = makeMockStorage({
      findEntityByCanonicalName: vi.fn().mockResolvedValue(existingEntity),
    });
    const embedding = makeMockEmbedding();

    const result = await persistEntitiesAndEdges(
      storage,
      embedding,
      TENANT_ID,
      FACT_ID,
      [makeEntity()],
      [],
    );

    expect(result.entityIdMap.get('alice smith')).toBe(existingId);
  });
});

describe('persistEntitiesAndEdges – linkFactEntity', () => {
  it('calls linkFactEntity for a newly created entity', async () => {
    const storage = makeMockStorage();
    const embedding = makeMockEmbedding();

    await persistEntitiesAndEdges(storage, embedding, TENANT_ID, FACT_ID, [makeEntity()], []);

    expect(storage.linkFactEntity).toHaveBeenCalledOnce();
    const [linkedFactId, , role] = vi.mocked(storage.linkFactEntity).mock.calls[0];
    expect(linkedFactId).toBe(FACT_ID);
    expect(role).toBe('mentioned');
  });

  it('calls linkFactEntity for an existing entity too', async () => {
    const existingEntity: Entity = {
      id: 'bbbbbbbb-0000-0000-0000-000000000000',
      tenantId: TENANT_ID,
      name: 'Alice Smith',
      entityType: 'person',
      canonicalName: 'alice smith',
      properties: {},
      embeddingModel: 'test-model',
      embeddingDim: 3,
      mergeTargetId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const storage = makeMockStorage({
      findEntityByCanonicalName: vi.fn().mockResolvedValue(existingEntity),
    });
    const embedding = makeMockEmbedding();

    await persistEntitiesAndEdges(storage, embedding, TENANT_ID, FACT_ID, [makeEntity()], []);

    expect(storage.linkFactEntity).toHaveBeenCalledOnce();
    expect(vi.mocked(storage.linkFactEntity).mock.calls[0][0]).toBe(FACT_ID);
    expect(vi.mocked(storage.linkFactEntity).mock.calls[0][1]).toBe(existingEntity.id);
  });

  it('calls linkFactEntity once per unique entity', async () => {
    const storage = makeMockStorage();
    const embedding = makeMockEmbedding();
    const entity1 = makeEntity({ name: 'Alice Smith', canonicalName: 'alice smith' });
    const entity2 = makeEntity({
      name: 'Acme Corp',
      entityType: 'organization',
      canonicalName: 'acme corp',
    });

    await persistEntitiesAndEdges(
      storage,
      embedding,
      TENANT_ID,
      FACT_ID,
      [entity1, entity2],
      [],
    );

    expect(storage.linkFactEntity).toHaveBeenCalledTimes(2);
  });
});

describe('persistEntitiesAndEdges – edge creation', () => {
  it('creates an edge when both source and target are in entityIdMap', async () => {
    const storage = makeMockStorage();
    const embedding = makeMockEmbedding();
    const alice = makeEntity({ name: 'Alice Smith', canonicalName: 'alice smith' });
    const acme = makeEntity({
      name: 'Acme Corp',
      entityType: 'organization',
      canonicalName: 'acme corp',
    });
    const edge = makeEdge({ sourceName: 'alice smith', targetName: 'acme corp' });

    const result = await persistEntitiesAndEdges(
      storage,
      embedding,
      TENANT_ID,
      FACT_ID,
      [alice, acme],
      [edge],
    );

    expect(storage.createEdge).toHaveBeenCalledOnce();
    expect(result.edgesCreated).toBe(1);
  });

  it('passes correct sourceId and targetId when creating edge', async () => {
    const storage = makeMockStorage();
    const embedding = makeMockEmbedding();

    // Capture created IDs by intercepting createEntity
    const createdIds: string[] = [];
    vi.mocked(storage.createEntity).mockImplementation(async (e) => {
      createdIds.push((e as { id: string }).id);
      return {} as Entity;
    });

    const alice = makeEntity({ name: 'Alice Smith', canonicalName: 'alice smith' });
    const acme = makeEntity({
      name: 'Acme Corp',
      entityType: 'organization',
      canonicalName: 'acme corp',
    });
    const edge = makeEdge({ sourceName: 'alice smith', targetName: 'acme corp' });

    const result = await persistEntitiesAndEdges(
      storage,
      embedding,
      TENANT_ID,
      FACT_ID,
      [alice, acme],
      [edge],
    );

    const edgeCall = vi.mocked(storage.createEdge).mock.calls[0][0];
    const aliceId = result.entityIdMap.get('alice smith')!;
    const acmeId = result.entityIdMap.get('acme corp')!;
    expect(edgeCall.sourceId).toBe(aliceId);
    expect(edgeCall.targetId).toBe(acmeId);
    expect(edgeCall.factId).toBe(FACT_ID);
  });

  it('does NOT create edge if source entity not in entityIdMap', async () => {
    const storage = makeMockStorage();
    const embedding = makeMockEmbedding();
    const acme = makeEntity({
      name: 'Acme Corp',
      entityType: 'organization',
      canonicalName: 'acme corp',
    });
    // edge references 'alice smith' which was never extracted
    const edge = makeEdge({ sourceName: 'alice smith', targetName: 'acme corp' });

    const result = await persistEntitiesAndEdges(
      storage,
      embedding,
      TENANT_ID,
      FACT_ID,
      [acme],
      [edge],
    );

    expect(storage.createEdge).not.toHaveBeenCalled();
    expect(result.edgesCreated).toBe(0);
  });

  it('does NOT create edge if target entity not in entityIdMap', async () => {
    const storage = makeMockStorage();
    const embedding = makeMockEmbedding();
    const alice = makeEntity({ name: 'Alice Smith', canonicalName: 'alice smith' });
    // edge references 'acme corp' which was never extracted
    const edge = makeEdge({ sourceName: 'alice smith', targetName: 'acme corp' });

    const result = await persistEntitiesAndEdges(
      storage,
      embedding,
      TENANT_ID,
      FACT_ID,
      [alice],
      [edge],
    );

    expect(storage.createEdge).not.toHaveBeenCalled();
    expect(result.edgesCreated).toBe(0);
  });
});

describe('persistEntitiesAndEdges – deduplication', () => {
  it('deduplicates entities by canonical name: two identical → one createEntity call', async () => {
    const storage = makeMockStorage();
    const embedding = makeMockEmbedding();
    const duplicate1 = makeEntity({ name: 'Alice Smith', canonicalName: 'alice smith' });
    const duplicate2 = makeEntity({ name: 'Alice Smith', canonicalName: 'alice smith' });

    await persistEntitiesAndEdges(
      storage,
      embedding,
      TENANT_ID,
      FACT_ID,
      [duplicate1, duplicate2],
      [],
    );

    expect(storage.createEntity).toHaveBeenCalledOnce();
    expect(storage.linkFactEntity).toHaveBeenCalledOnce();
  });

  it('both deduplicated entities map to the same ID in entityIdMap', async () => {
    const storage = makeMockStorage();
    const embedding = makeMockEmbedding();
    const e1 = makeEntity({ name: 'Alice Smith', canonicalName: 'alice smith' });
    const e2 = makeEntity({ name: 'Alice Smith', canonicalName: 'alice smith' });

    const result = await persistEntitiesAndEdges(
      storage,
      embedding,
      TENANT_ID,
      FACT_ID,
      [e1, e2],
      [],
    );

    expect(result.entityIdMap.has('alice smith')).toBe(true);
    expect(result.entityIdMap.size).toBe(1);
  });
});

describe('persistEntitiesAndEdges – return values', () => {
  it('returns correct entitiesCreated count for new entities', async () => {
    const storage = makeMockStorage();
    const embedding = makeMockEmbedding();
    const entities = [
      makeEntity({ canonicalName: 'alice smith' }),
      makeEntity({ name: 'Bob Jones', entityType: 'person', canonicalName: 'bob jones' }),
    ];

    const result = await persistEntitiesAndEdges(
      storage,
      embedding,
      TENANT_ID,
      FACT_ID,
      entities,
      [],
    );

    expect(result.entitiesCreated).toBe(2);
  });

  it('does not count existing entities in entitiesCreated', async () => {
    const existingEntity: Entity = {
      id: 'cccccccc-0000-0000-0000-000000000000',
      tenantId: TENANT_ID,
      name: 'Alice Smith',
      entityType: 'person',
      canonicalName: 'alice smith',
      properties: {},
      embeddingModel: 'test-model',
      embeddingDim: 3,
      mergeTargetId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const storage = makeMockStorage({
      findEntityByCanonicalName: vi.fn().mockResolvedValue(existingEntity),
    });
    const embedding = makeMockEmbedding();

    const result = await persistEntitiesAndEdges(
      storage,
      embedding,
      TENANT_ID,
      FACT_ID,
      [makeEntity()],
      [],
    );

    expect(result.entitiesCreated).toBe(0);
  });

  it('returns correct edgesCreated count', async () => {
    const storage = makeMockStorage();
    const embedding = makeMockEmbedding();
    const entities = [
      makeEntity({ canonicalName: 'alice smith' }),
      makeEntity({ name: 'Acme Corp', entityType: 'organization', canonicalName: 'acme corp' }),
    ];
    const edges = [
      makeEdge({ sourceName: 'alice smith', targetName: 'acme corp', relation: 'works_at' }),
    ];

    const result = await persistEntitiesAndEdges(
      storage,
      embedding,
      TENANT_ID,
      FACT_ID,
      entities,
      edges,
    );

    expect(result.edgesCreated).toBe(1);
  });

  it('returns entityIdMap with all canonical names present', async () => {
    const storage = makeMockStorage();
    const embedding = makeMockEmbedding();
    const entities = [
      makeEntity({ canonicalName: 'alice smith' }),
      makeEntity({ name: 'Acme Corp', entityType: 'organization', canonicalName: 'acme corp' }),
    ];

    const result = await persistEntitiesAndEdges(
      storage,
      embedding,
      TENANT_ID,
      FACT_ID,
      entities,
      [],
    );

    expect(result.entityIdMap.has('alice smith')).toBe(true);
    expect(result.entityIdMap.has('acme corp')).toBe(true);
    expect(result.entityIdMap.size).toBe(2);
  });
});

describe('persistEntitiesAndEdges – embedding', () => {
  it('embeds entity.name (not canonicalName) for semantic search', async () => {
    const storage = makeMockStorage();
    const embedding = makeMockEmbedding();
    const entity = makeEntity({ name: 'Alice Smith', canonicalName: 'alice smith' });

    await persistEntitiesAndEdges(storage, embedding, TENANT_ID, FACT_ID, [entity], []);

    expect(embedding.embed).toHaveBeenCalledWith('Alice Smith');
    expect(embedding.embed).not.toHaveBeenCalledWith('alice smith');
  });

  it('stores embedding model and dimensions on created entity', async () => {
    const storage = makeMockStorage();
    const embedding = makeMockEmbedding({ model: 'my-model', dimensions: 1536 });

    await persistEntitiesAndEdges(storage, embedding, TENANT_ID, FACT_ID, [makeEntity()], []);

    const createCall = vi.mocked(storage.createEntity).mock.calls[0][0];
    expect(createCall.embeddingModel).toBe('my-model');
    expect(createCall.embeddingDim).toBe(1536);
  });

  it('does NOT call embed when entity already exists', async () => {
    const existingEntity: Entity = {
      id: 'dddddddd-0000-0000-0000-000000000000',
      tenantId: TENANT_ID,
      name: 'Alice Smith',
      entityType: 'person',
      canonicalName: 'alice smith',
      properties: {},
      embeddingModel: 'test-model',
      embeddingDim: 3,
      mergeTargetId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const storage = makeMockStorage({
      findEntityByCanonicalName: vi.fn().mockResolvedValue(existingEntity),
    });
    const embedding = makeMockEmbedding();

    await persistEntitiesAndEdges(storage, embedding, TENANT_ID, FACT_ID, [makeEntity()], []);

    expect(embedding.embed).not.toHaveBeenCalled();
  });
});

describe('persistEntitiesAndEdges – empty inputs', () => {
  it('empty entities array → zero createEntity calls, zero linkFactEntity calls', async () => {
    const storage = makeMockStorage();
    const embedding = makeMockEmbedding();

    const result = await persistEntitiesAndEdges(
      storage,
      embedding,
      TENANT_ID,
      FACT_ID,
      [],
      [],
    );

    expect(storage.createEntity).not.toHaveBeenCalled();
    expect(storage.linkFactEntity).not.toHaveBeenCalled();
    expect(result.entitiesCreated).toBe(0);
    expect(result.edgesCreated).toBe(0);
    expect(result.entityIdMap.size).toBe(0);
  });

  it('empty edges array → zero createEdge calls', async () => {
    const storage = makeMockStorage();
    const embedding = makeMockEmbedding();

    const result = await persistEntitiesAndEdges(
      storage,
      embedding,
      TENANT_ID,
      FACT_ID,
      [makeEntity()],
      [],
    );

    expect(storage.createEdge).not.toHaveBeenCalled();
    expect(result.edgesCreated).toBe(0);
  });
});

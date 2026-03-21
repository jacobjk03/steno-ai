import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteStorageAdapter } from '../src/storage.js';
import { encodeCursor, decodeCursor } from '../src/cursor.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestAdapter() {
  return SQLiteStorageAdapter.inMemory({ embeddingDim: 3 });
}

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TENANT_ID_2 = '00000000-0000-0000-0000-000000000002';

async function seedTenant(adapter: SQLiteStorageAdapter, id = TENANT_ID) {
  return adapter.createTenant({
    id,
    name: 'Test Tenant',
    slug: `test-tenant-${id.slice(-4)}`,
    plan: 'free',
    config: {},
  });
}

function makeEmbedding(x: number, y: number, z: number): number[] {
  return [x, y, z];
}

let adapter: SQLiteStorageAdapter;

beforeEach(async () => {
  adapter = createTestAdapter();
  await seedTenant(adapter);
});

afterEach(() => {
  adapter.close();
});

// =============================================================================
// Health
// =============================================================================

describe('Health', () => {
  it('ping returns true', async () => {
    expect(await adapter.ping()).toBe(true);
  });
});

// =============================================================================
// Tenants
// =============================================================================

describe('Tenants', () => {
  it('create → get → getBySlug → update', async () => {
    const tenant = await adapter.getTenant(TENANT_ID);
    expect(tenant).not.toBeNull();
    expect(tenant!.name).toBe('Test Tenant');
    expect(tenant!.slug).toBe('test-tenant-0001');
    expect(tenant!.plan).toBe('free');
    expect(tenant!.active).toBe(true);

    const bySlug = await adapter.getTenantBySlug('test-tenant-0001');
    expect(bySlug).not.toBeNull();
    expect(bySlug!.id).toBe(TENANT_ID);

    const updated = await adapter.updateTenant(TENANT_ID, { name: 'Updated Name', plan: 'pro' });
    expect(updated.name).toBe('Updated Name');
    expect(updated.plan).toBe('pro');
  });

  it('getTenant returns null for non-existent', async () => {
    expect(await adapter.getTenant('non-existent')).toBeNull();
  });
});

// =============================================================================
// API Keys
// =============================================================================

describe('API Keys', () => {
  it('create → getByPrefix → list → revoke → updateLastUsed', async () => {
    const key = await adapter.createApiKey({
      id: 'key-1',
      tenantId: TENANT_ID,
      keyHash: 'hash123',
      keyPrefix: 'sk_test',
      name: 'My Key',
      scopes: ['read', 'write'],
    });
    expect(key.id).toBe('key-1');
    expect(key.name).toBe('My Key');
    expect(key.active).toBe(true);
    expect(key.scopes).toEqual(['read', 'write']);

    const byPrefix = await adapter.getApiKeyByPrefix('sk_test');
    expect(byPrefix).not.toBeNull();
    expect(byPrefix!.id).toBe('key-1');

    const list = await adapter.getApiKeysForTenant(TENANT_ID);
    expect(list).toHaveLength(1);

    await adapter.updateApiKeyLastUsed('key-1');
    const after = await adapter.getApiKeyByPrefix('sk_test');
    expect(after!.lastUsedAt).not.toBeNull();

    await adapter.revokeApiKey(TENANT_ID, 'key-1');
    const revoked = await adapter.getApiKeyByPrefix('sk_test');
    expect(revoked).toBeNull(); // no longer active
  });
});

// =============================================================================
// Facts CRUD
// =============================================================================

describe('Facts CRUD', () => {
  it('create → get → getByIds → getByLineage → invalidate', async () => {
    const fact = await adapter.createFact({
      id: 'fact-1',
      tenantId: TENANT_ID,
      scope: 'user',
      scopeId: 'user-1',
      content: 'The sky is blue',
      lineageId: 'lineage-1',
      embeddingModel: 'test-model',
      embeddingDim: 3,
      embedding: makeEmbedding(1, 0, 0),
      importance: 0.7,
      confidence: 0.9,
      operation: 'create',
      contradictionStatus: 'none',
      modality: 'text',
      tags: ['color'],
      metadata: { source: 'observation' },
    });

    expect(fact.id).toBe('fact-1');
    expect(fact.content).toBe('The sky is blue');
    expect(fact.tenantId).toBe(TENANT_ID);
    expect(fact.scope).toBe('user');
    expect(fact.version).toBe(1);
    expect(fact.validUntil).toBeNull();
    expect(fact.tags).toEqual(['color']);
    expect(fact.metadata).toEqual({ source: 'observation' });

    const fetched = await adapter.getFact(TENANT_ID, 'fact-1');
    expect(fetched).not.toBeNull();
    expect(fetched!.content).toBe('The sky is blue');

    const byIds = await adapter.getFactsByIds(TENANT_ID, ['fact-1']);
    expect(byIds).toHaveLength(1);

    const byLineage = await adapter.getFactsByLineage(TENANT_ID, 'lineage-1');
    expect(byLineage).toHaveLength(1);

    await adapter.invalidateFact(TENANT_ID, 'fact-1');
    const invalidated = await adapter.getFact(TENANT_ID, 'fact-1');
    expect(invalidated!.validUntil).not.toBeNull();
  });

  it('getFactsByIds returns empty for empty input', async () => {
    const result = await adapter.getFactsByIds(TENANT_ID, []);
    expect(result).toEqual([]);
  });

  it('getFactsByScope with pagination', async () => {
    // Create 5 facts with staggered timestamps
    for (let i = 1; i <= 5; i++) {
      await adapter.createFact({
        id: `fact-p-${i}`,
        tenantId: TENANT_ID,
        scope: 'user',
        scopeId: 'user-1',
        content: `Fact ${i}`,
        lineageId: `lineage-p-${i}`,
        embeddingModel: 'test',
        embeddingDim: 3,
      });
    }

    const page1 = await adapter.getFactsByScope(TENANT_ID, 'user', 'user-1', { limit: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.hasMore).toBe(true);
    expect(page1.cursor).not.toBeNull();

    const page2 = await adapter.getFactsByScope(TENANT_ID, 'user', 'user-1', {
      limit: 2,
      cursor: page1.cursor!,
    });
    expect(page2.data).toHaveLength(2);
    expect(page2.hasMore).toBe(true);

    const page3 = await adapter.getFactsByScope(TENANT_ID, 'user', 'user-1', {
      limit: 2,
      cursor: page2.cursor!,
    });
    expect(page3.data).toHaveLength(1);
    expect(page3.hasMore).toBe(false);
  });

  it('purgeFacts removes all facts in scope', async () => {
    await adapter.createFact({
      id: 'fact-purge-1',
      tenantId: TENANT_ID,
      scope: 'session',
      scopeId: 'sess-1',
      content: 'Will be purged',
      lineageId: 'lp-1',
      embeddingModel: 'test',
      embeddingDim: 3,
      embedding: makeEmbedding(1, 0, 0),
    });

    const count = await adapter.purgeFacts(TENANT_ID, 'session', 'sess-1');
    expect(count).toBe(1);

    const after = await adapter.getFact(TENANT_ID, 'fact-purge-1');
    expect(after).toBeNull();
  });
});

// =============================================================================
// Vector Search
// =============================================================================

describe('Vector Search', () => {
  it('creates fact with embedding and finds via vectorSearch', async () => {
    await adapter.createFact({
      id: 'vs-1',
      tenantId: TENANT_ID,
      scope: 'user',
      scopeId: 'user-1',
      content: 'I love TypeScript',
      lineageId: 'vs-lin-1',
      embeddingModel: 'test',
      embeddingDim: 3,
      embedding: makeEmbedding(1, 0, 0),
    });

    await adapter.createFact({
      id: 'vs-2',
      tenantId: TENANT_ID,
      scope: 'user',
      scopeId: 'user-1',
      content: 'I hate bugs',
      lineageId: 'vs-lin-2',
      embeddingModel: 'test',
      embeddingDim: 3,
      embedding: makeEmbedding(0, 1, 0),
    });

    const results = await adapter.vectorSearch({
      embedding: makeEmbedding(1, 0.1, 0),
      tenantId: TENANT_ID,
      scope: 'user',
      scopeId: 'user-1',
      limit: 5,
    });

    expect(results.length).toBeGreaterThan(0);
    // First result should be the most similar (closer to [1,0,0])
    expect(results[0]!.fact.id).toBe('vs-1');
    expect(results[0]!.similarity).toBeGreaterThan(0.9);
  });

  it('respects minSimilarity filter', async () => {
    await adapter.createFact({
      id: 'vs-min-1',
      tenantId: TENANT_ID,
      scope: 'user',
      scopeId: 'u1',
      content: 'test',
      lineageId: 'l1',
      embeddingModel: 'test',
      embeddingDim: 3,
      embedding: makeEmbedding(1, 0, 0),
    });

    const results = await adapter.vectorSearch({
      embedding: makeEmbedding(0, 1, 0), // orthogonal
      tenantId: TENANT_ID,
      scope: 'user',
      scopeId: 'u1',
      limit: 5,
      minSimilarity: 0.5,
    });

    expect(results).toHaveLength(0);
  });

  it('does not return invalidated facts by default', async () => {
    await adapter.createFact({
      id: 'vs-inv-1',
      tenantId: TENANT_ID,
      scope: 'user',
      scopeId: 'u2',
      content: 'will be invalidated',
      lineageId: 'l2',
      embeddingModel: 'test',
      embeddingDim: 3,
      embedding: makeEmbedding(1, 0, 0),
    });

    await adapter.invalidateFact(TENANT_ID, 'vs-inv-1');

    const results = await adapter.vectorSearch({
      embedding: makeEmbedding(1, 0, 0),
      tenantId: TENANT_ID,
      scope: 'user',
      scopeId: 'u2',
      limit: 5,
    });

    expect(results).toHaveLength(0);
  });
});

// =============================================================================
// Keyword Search
// =============================================================================

describe('Keyword Search', () => {
  it('creates fact and finds via keywordSearch', async () => {
    await adapter.createFact({
      id: 'kw-1',
      tenantId: TENANT_ID,
      scope: 'user',
      scopeId: 'user-1',
      content: 'TypeScript is a programming language',
      lineageId: 'kw-lin-1',
      embeddingModel: 'test',
      embeddingDim: 3,
    });

    await adapter.createFact({
      id: 'kw-2',
      tenantId: TENANT_ID,
      scope: 'user',
      scopeId: 'user-1',
      content: 'Python is also a programming language',
      lineageId: 'kw-lin-2',
      embeddingModel: 'test',
      embeddingDim: 3,
    });

    const results = await adapter.keywordSearch({
      query: 'TypeScript',
      tenantId: TENANT_ID,
      scope: 'user',
      scopeId: 'user-1',
      limit: 5,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.fact.id).toBe('kw-1');
    expect(results[0]!.rankScore).toBeGreaterThan(0);
  });

  it('returns empty for non-matching query', async () => {
    await adapter.createFact({
      id: 'kw-3',
      tenantId: TENANT_ID,
      scope: 'user',
      scopeId: 'user-1',
      content: 'The weather is nice today',
      lineageId: 'kw-lin-3',
      embeddingModel: 'test',
      embeddingDim: 3,
    });

    const results = await adapter.keywordSearch({
      query: 'quantum mechanics',
      tenantId: TENANT_ID,
      scope: 'user',
      scopeId: 'user-1',
      limit: 5,
    });

    expect(results).toHaveLength(0);
  });
});

// =============================================================================
// Entities
// =============================================================================

describe('Entities', () => {
  it('create → get → findByCanonicalName → listForTenant', async () => {
    const entity = await adapter.createEntity({
      id: 'ent-1',
      tenantId: TENANT_ID,
      name: 'TypeScript',
      entityType: 'technology',
      canonicalName: 'typescript',
      properties: { category: 'language' },
    });

    expect(entity.id).toBe('ent-1');
    expect(entity.name).toBe('TypeScript');
    expect(entity.properties).toEqual({ category: 'language' });

    const fetched = await adapter.getEntity(TENANT_ID, 'ent-1');
    expect(fetched).not.toBeNull();

    const byName = await adapter.findEntityByCanonicalName(TENANT_ID, 'typescript', 'technology');
    expect(byName).not.toBeNull();
    expect(byName!.id).toBe('ent-1');

    const list = await adapter.getEntitiesForTenant(TENANT_ID, { limit: 10 });
    expect(list.data).toHaveLength(1);
    expect(list.hasMore).toBe(false);
  });
});

// =============================================================================
// Fact-Entity Junction
// =============================================================================

describe('Fact-Entity Junction', () => {
  it('linkFactEntity → getEntitiesForFact → getFactsForEntity', async () => {
    await adapter.createFact({
      id: 'fe-fact-1',
      tenantId: TENANT_ID,
      scope: 'user',
      scopeId: 'user-1',
      content: 'TypeScript is great',
      lineageId: 'fe-lin-1',
      embeddingModel: 'test',
      embeddingDim: 3,
    });

    await adapter.createEntity({
      id: 'fe-ent-1',
      tenantId: TENANT_ID,
      name: 'TypeScript',
      entityType: 'technology',
      canonicalName: 'typescript',
    });

    await adapter.linkFactEntity('fe-fact-1', 'fe-ent-1', 'subject');

    const entities = await adapter.getEntitiesForFact('fe-fact-1');
    expect(entities).toHaveLength(1);
    expect(entities[0]!.id).toBe('fe-ent-1');

    const facts = await adapter.getFactsForEntity(TENANT_ID, 'fe-ent-1', { limit: 10 });
    expect(facts.data).toHaveLength(1);
    expect(facts.data[0]!.id).toBe('fe-fact-1');
  });
});

// =============================================================================
// Edges + Graph
// =============================================================================

describe('Edges + Graph', () => {
  it('createEdge → getEdgesForEntity → graphTraversal', async () => {
    // Create entities
    await adapter.createEntity({
      id: 'g-ent-1',
      tenantId: TENANT_ID,
      name: 'Node A',
      entityType: 'concept',
      canonicalName: 'node_a',
    });
    await adapter.createEntity({
      id: 'g-ent-2',
      tenantId: TENANT_ID,
      name: 'Node B',
      entityType: 'concept',
      canonicalName: 'node_b',
    });
    await adapter.createEntity({
      id: 'g-ent-3',
      tenantId: TENANT_ID,
      name: 'Node C',
      entityType: 'concept',
      canonicalName: 'node_c',
    });

    // Create edges: A→B, B→C
    const edge1 = await adapter.createEdge({
      id: 'edge-1',
      tenantId: TENANT_ID,
      sourceId: 'g-ent-1',
      targetId: 'g-ent-2',
      relation: 'related_to',
      edgeType: 'associative',
      weight: 1.0,
      confidence: 0.9,
      metadata: {},
    });
    expect(edge1.id).toBe('edge-1');
    expect(edge1.sourceId).toBe('g-ent-1');

    await adapter.createEdge({
      id: 'edge-2',
      tenantId: TENANT_ID,
      sourceId: 'g-ent-2',
      targetId: 'g-ent-3',
      relation: 'leads_to',
      edgeType: 'causal',
      weight: 0.8,
      confidence: 0.7,
      metadata: {},
    });

    const edgesForA = await adapter.getEdgesForEntity(TENANT_ID, 'g-ent-1');
    expect(edgesForA).toHaveLength(1);

    const edgesForB = await adapter.getEdgesForEntity(TENANT_ID, 'g-ent-2');
    expect(edgesForB).toHaveLength(2); // A→B and B→C

    // Graph traversal from A, depth 2 → should find A, B, C
    const graph = await adapter.graphTraversal({
      tenantId: TENANT_ID,
      entityIds: ['g-ent-1'],
      maxDepth: 2,
      maxEntities: 10,
    });

    expect(graph.entities).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);
    const entityIds = graph.entities.map((e) => e.id).sort();
    expect(entityIds).toEqual(['g-ent-1', 'g-ent-2', 'g-ent-3']);
  });

  it('graphTraversal respects maxEntities', async () => {
    await adapter.createEntity({
      id: 'max-1',
      tenantId: TENANT_ID,
      name: 'M1',
      entityType: 'x',
      canonicalName: 'max_1',
    });
    await adapter.createEntity({
      id: 'max-2',
      tenantId: TENANT_ID,
      name: 'M2',
      entityType: 'x',
      canonicalName: 'max_2',
    });
    await adapter.createEntity({
      id: 'max-3',
      tenantId: TENANT_ID,
      name: 'M3',
      entityType: 'x',
      canonicalName: 'max_3',
    });
    await adapter.createEdge({
      id: 'me-1',
      tenantId: TENANT_ID,
      sourceId: 'max-1',
      targetId: 'max-2',
      relation: 'r',
      edgeType: 'associative',
    });
    await adapter.createEdge({
      id: 'me-2',
      tenantId: TENANT_ID,
      sourceId: 'max-2',
      targetId: 'max-3',
      relation: 'r',
      edgeType: 'associative',
    });

    const result = await adapter.graphTraversal({
      tenantId: TENANT_ID,
      entityIds: ['max-1'],
      maxDepth: 5,
      maxEntities: 2,
    });

    expect(result.entities.length).toBeLessThanOrEqual(2);
  });
});

// =============================================================================
// Triggers
// =============================================================================

describe('Triggers', () => {
  it('create → get → getActive → update → incrementFired → delete', async () => {
    const trigger = await adapter.createTrigger({
      id: 'trig-1',
      tenantId: TENANT_ID,
      scope: 'user',
      scopeId: 'user-1',
      condition: { keyword_any: ['important'] },
      factIds: [],
      entityIds: [],
      priority: 5,
    });

    expect(trigger.id).toBe('trig-1');
    expect(trigger.active).toBe(true);
    expect(trigger.timesFired).toBe(0);
    expect(trigger.condition).toEqual({ keyword_any: ['important'] });

    const fetched = await adapter.getTrigger(TENANT_ID, 'trig-1');
    expect(fetched).not.toBeNull();

    const active = await adapter.getActiveTriggers(TENANT_ID, 'user', 'user-1');
    expect(active).toHaveLength(1);

    const updated = await adapter.updateTrigger(TENANT_ID, 'trig-1', { priority: 10 });
    expect(updated.priority).toBe(10);

    await adapter.incrementTriggerFired(TENANT_ID, 'trig-1');
    const fired = await adapter.getTrigger(TENANT_ID, 'trig-1');
    expect(fired!.timesFired).toBe(1);
    expect(fired!.lastFiredAt).not.toBeNull();

    await adapter.deleteTrigger(TENANT_ID, 'trig-1');
    const deleted = await adapter.getTrigger(TENANT_ID, 'trig-1');
    expect(deleted).toBeNull();
  });
});

// =============================================================================
// Memory Access
// =============================================================================

describe('Memory Access', () => {
  it('create → updateFeedback', async () => {
    // Need a fact to reference
    await adapter.createFact({
      id: 'ma-fact-1',
      tenantId: TENANT_ID,
      scope: 'user',
      scopeId: 'u1',
      content: 'fact for memory access',
      lineageId: 'ma-lin-1',
      embeddingModel: 'test',
      embeddingDim: 3,
    });

    const access = await adapter.createMemoryAccess({
      id: 'ma-1',
      tenantId: TENANT_ID,
      factId: 'ma-fact-1',
      query: 'what do I know?',
      retrievalMethod: 'vector',
      similarityScore: 0.85,
      rankPosition: 0,
    });

    expect(access.id).toBe('ma-1');
    expect(access.query).toBe('what do I know?');
    expect(access.wasUseful).toBeNull();

    await adapter.updateFeedback(TENANT_ID, 'ma-fact-1', {
      wasUseful: true,
      feedbackType: 'explicit_positive',
      feedbackDetail: 'Very helpful!',
    });

    // Verify by checking db directly (no public accessor for memory access by id)
    const db = adapter.getDatabase();
    const row = db.prepare('SELECT * FROM memory_accesses WHERE id = ?').get('ma-1') as Record<string, unknown>;
    expect(row['was_useful']).toBe(1);
    expect(row['feedback_type']).toBe('explicit_positive');
    expect(row['feedback_detail']).toBe('Very helpful!');
  });
});

// =============================================================================
// Extractions
// =============================================================================

describe('Extractions', () => {
  it('create → get → update → getByHash → listByTenant', async () => {
    const extraction = await adapter.createExtraction({
      id: 'ext-1',
      tenantId: TENANT_ID,
      inputType: 'conversation',
      inputData: 'Hello, world!',
      inputHash: 'abc123',
      scope: 'user',
      scopeId: 'user-1',
    });

    expect(extraction.id).toBe('ext-1');
    expect(extraction.status).toBe('queued');
    expect(extraction.factsCreated).toBe(0);

    const fetched = await adapter.getExtraction(TENANT_ID, 'ext-1');
    expect(fetched).not.toBeNull();

    const updated = await adapter.updateExtraction(TENANT_ID, 'ext-1', {
      status: 'completed',
      factsCreated: 3,
      durationMs: 150,
    });
    expect(updated.status).toBe('completed');
    expect(updated.factsCreated).toBe(3);
    expect(updated.durationMs).toBe(150);

    const byHash = await adapter.getExtractionByHash(TENANT_ID, 'abc123');
    expect(byHash).not.toBeNull();
    expect(byHash!.id).toBe('ext-1');

    const list = await adapter.getExtractionsByTenant(TENANT_ID, { limit: 10 });
    expect(list.data).toHaveLength(1);
  });
});

// =============================================================================
// Sessions
// =============================================================================

describe('Sessions', () => {
  it('create → get → end → listByScope', async () => {
    const session = await adapter.createSession({
      id: 'sess-1',
      tenantId: TENANT_ID,
      scope: 'user',
      scopeId: 'user-1',
      metadata: { client: 'test' },
    });

    expect(session.id).toBe('sess-1');
    expect(session.endedAt).toBeNull();
    expect(session.summary).toBeNull();
    expect(session.metadata).toEqual({ client: 'test' });

    const fetched = await adapter.getSession(TENANT_ID, 'sess-1');
    expect(fetched).not.toBeNull();

    const ended = await adapter.endSession(TENANT_ID, 'sess-1', 'Great session', ['typescript', 'testing']);
    expect(ended.endedAt).not.toBeNull();
    expect(ended.summary).toBe('Great session');
    expect(ended.topics).toEqual(['typescript', 'testing']);

    const list = await adapter.getSessionsByScope(TENANT_ID, 'user', 'user-1', { limit: 10 });
    expect(list.data).toHaveLength(1);
    expect(list.hasMore).toBe(false);
  });
});

// =============================================================================
// Usage
// =============================================================================

describe('Usage', () => {
  it('incrementUsage (atomic) → getUsage → getCurrentUsage', async () => {
    await adapter.incrementUsage(TENANT_ID, 100, 5, 2, 0.01);

    const current = await adapter.getCurrentUsage(TENANT_ID);
    expect(current).not.toBeNull();
    expect(current!.tokensUsed).toBe(100);
    expect(current!.queriesUsed).toBe(5);
    expect(current!.extractionsCount).toBe(2);

    // Increment again — should add to existing
    await adapter.incrementUsage(TENANT_ID, 50, 3, 1, 0.005);
    const updated = await adapter.getCurrentUsage(TENANT_ID);
    expect(updated!.tokensUsed).toBe(150);
    expect(updated!.queriesUsed).toBe(8);
    expect(updated!.extractionsCount).toBe(3);

    // getUsage with specific period
    const n = new Date();
    const periodStart = new Date(n.getFullYear(), n.getMonth(), 1);
    const byPeriod = await adapter.getUsage(TENANT_ID, periodStart);
    expect(byPeriod).not.toBeNull();
    expect(byPeriod!.tokensUsed).toBe(150);
  });
});

// =============================================================================
// Webhooks
// =============================================================================

describe('Webhooks', () => {
  it('create → get → listForTenant → getByEvent → delete', async () => {
    const webhook = await adapter.createWebhook({
      id: 'wh-1',
      tenantId: TENANT_ID,
      url: 'https://example.com/webhook',
      events: ['extraction.completed', 'trigger.fired'],
      secret: 'supersecretvalue1234',
      secretHash: 'hashed_secret',
      signingKey: 'signing_key_123',
    });

    expect(webhook.id).toBe('wh-1');
    expect(webhook.url).toBe('https://example.com/webhook');
    expect(webhook.events).toEqual(['extraction.completed', 'trigger.fired']);
    expect(webhook.active).toBe(true);

    const fetched = await adapter.getWebhook(TENANT_ID, 'wh-1');
    expect(fetched).not.toBeNull();

    const list = await adapter.getWebhooksForTenant(TENANT_ID);
    expect(list).toHaveLength(1);

    const byEvent = await adapter.getWebhooksByEvent(TENANT_ID, 'extraction.completed');
    expect(byEvent).toHaveLength(1);

    const noMatch = await adapter.getWebhooksByEvent(TENANT_ID, 'usage.limit_exceeded');
    expect(noMatch).toHaveLength(0);

    await adapter.deleteWebhook(TENANT_ID, 'wh-1');
    const deleted = await adapter.getWebhook(TENANT_ID, 'wh-1');
    expect(deleted).toBeNull();
  });
});

// =============================================================================
// Pagination (cursor encode/decode)
// =============================================================================

describe('Pagination', () => {
  it('cursor encode/decode round-trip', () => {
    const ts = '2024-01-15T10:30:00.000Z';
    const id = 'some-uuid';
    const encoded = encodeCursor(ts, id);
    const decoded = decodeCursor(encoded);
    expect(decoded.ts).toBe(ts);
    expect(decoded.id).toBe(id);
  });

  it('entities pagination with multiple pages', async () => {
    for (let i = 1; i <= 5; i++) {
      await adapter.createEntity({
        id: `pg-ent-${i}`,
        tenantId: TENANT_ID,
        name: `Entity ${i}`,
        entityType: 'thing',
        canonicalName: `entity_${i}`,
      });
    }

    const page1 = await adapter.getEntitiesForTenant(TENANT_ID, { limit: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.hasMore).toBe(true);

    const page2 = await adapter.getEntitiesForTenant(TENANT_ID, { limit: 2, cursor: page1.cursor! });
    expect(page2.data).toHaveLength(2);
    expect(page2.hasMore).toBe(true);

    const page3 = await adapter.getEntitiesForTenant(TENANT_ID, { limit: 2, cursor: page2.cursor! });
    expect(page3.data).toHaveLength(1);
    expect(page3.hasMore).toBe(false);
  });
});

// =============================================================================
// Decay Scores
// =============================================================================

describe('Decay Scores', () => {
  it('updateDecayScores batch update', async () => {
    await adapter.createFact({
      id: 'decay-1',
      tenantId: TENANT_ID,
      scope: 'user',
      scopeId: 'u1',
      content: 'Decay test 1',
      lineageId: 'dl-1',
      embeddingModel: 'test',
      embeddingDim: 3,
    });
    await adapter.createFact({
      id: 'decay-2',
      tenantId: TENANT_ID,
      scope: 'user',
      scopeId: 'u1',
      content: 'Decay test 2',
      lineageId: 'dl-2',
      embeddingModel: 'test',
      embeddingDim: 3,
    });

    const accessDate = new Date('2024-06-01T12:00:00Z');
    await adapter.updateDecayScores(TENANT_ID, [
      { id: 'decay-1', decayScore: 0.5, lastAccessed: accessDate, frequency: 10, importance: 0.8 },
      { id: 'decay-2', decayScore: 0.3 },
    ]);

    const f1 = await adapter.getFact(TENANT_ID, 'decay-1');
    expect(f1!.decayScore).toBe(0.5);
    expect(f1!.frequency).toBe(10);
    expect(f1!.importance).toBe(0.8);
    expect(f1!.lastAccessed).not.toBeNull();

    const f2 = await adapter.getFact(TENANT_ID, 'decay-2');
    expect(f2!.decayScore).toBe(0.3);
    // frequency and importance should remain at defaults
    expect(f2!.frequency).toBe(0);
  });
});

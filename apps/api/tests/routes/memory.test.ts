import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { StorageAdapter } from '@steno-ai/engine';
import type { AppVariables } from '../../src/app.js';
import type { Env } from '../../src/env.js';
import type { Adapters } from '../../src/lib/adapters.js';
import { globalErrorHandler } from '../../src/middleware/error-handler.js';

// Mock auth middleware to bypass authentication in route tests
vi.mock('../../src/middleware/auth.js', () => ({
  authMiddleware: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

import { memoryRoutes, exportRoutes } from '../../src/routes/memory.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const FACT_ID = '00000000-0000-0000-0000-000000000010';
const LINEAGE_ID = '00000000-0000-0000-0000-000000000020';
const EXTRACTION_ID = '00000000-0000-0000-0000-000000000030';

function makeFact(overrides: Record<string, unknown> = {}) {
  return {
    id: FACT_ID,
    tenantId: TENANT_ID,
    scope: 'user',
    scopeId: 'user_1',
    sessionId: null,
    content: 'User prefers dark mode',
    embeddingModel: 'text-embedding-3-small',
    embeddingDim: 1536,
    version: 1,
    lineageId: LINEAGE_ID,
    validFrom: new Date('2025-01-01'),
    validUntil: null,
    operation: 'create',
    parentId: null,
    importance: 0.8,
    frequency: 1,
    lastAccessed: null,
    decayScore: 1.0,
    contradictionStatus: 'none',
    contradictsId: null,
    sourceType: 'conversation',
    sourceRef: null,
    confidence: 0.9,
    originalContent: 'I prefer dark mode',
    extractionId: EXTRACTION_ID,
    extractionTier: 'heuristic',
    modality: 'text',
    tags: [],
    metadata: {},
    createdAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function makeStorage(overrides: Partial<StorageAdapter> = {}): StorageAdapter {
  const noop = vi.fn().mockResolvedValue(undefined);
  const noopNull = vi.fn().mockResolvedValue(null);
  const noopList = vi.fn().mockResolvedValue([]);
  const noopPaged = vi
    .fn()
    .mockResolvedValue({ data: [], cursor: null, hasMore: false });
  const noopBool = vi.fn().mockResolvedValue(true);

  return {
    // Facts
    createFact: noop,
    getFact: noopNull,
    getFactsByIds: noopList,
    getFactsByLineage: noopList,
    getFactsByScope: noopPaged,
    invalidateFact: noop,
    purgeFacts: vi.fn().mockResolvedValue(0),
    updateDecayScores: noop,

    // Vector / keyword search
    vectorSearch: noopList,
    keywordSearch: noopList,

    // Entities
    createEntity: noop,
    getEntity: noopNull,
    findEntityByCanonicalName: noopNull,
    getEntitiesForTenant: noopPaged,

    // Fact-Entity junction
    linkFactEntity: noop,
    getEntitiesForFact: noopList,
    getFactsForEntity: noopPaged,

    // Edges
    createEdge: noop,
    getEdgesForEntity: noopList,
    graphTraversal: vi
      .fn()
      .mockResolvedValue({ entities: [], edges: [] }),

    // Triggers
    createTrigger: noop,
    getTrigger: noopNull,
    getActiveTriggers: noopList,
    updateTrigger: noop,
    deleteTrigger: noop,
    incrementTriggerFired: noop,

    // Memory access
    createMemoryAccess: noop,
    updateFeedback: noop,

    // Extractions
    createExtraction: noop,
    getExtraction: noopNull,
    updateExtraction: noop,
    getExtractionByHash: noopNull,
    getExtractionsByTenant: noopPaged,

    // Sessions
    createSession: noop,
    getSession: noopNull,
    endSession: noop,
    getSessionsByScope: noopPaged,

    // Tenants
    createTenant: noop,
    getTenant: noopNull,
    getTenantBySlug: noopNull,
    updateTenant: noop,

    // API Keys
    createApiKey: noop,
    getApiKeyByPrefix: noopNull,
    getApiKeysForTenant: noopList,
    revokeApiKey: noop,
    updateApiKeyLastUsed: noop,

    // Usage
    incrementUsage: noop,
    getUsage: noopNull,
    getCurrentUsage: noopNull,

    // Webhooks
    createWebhook: noop,
    getWebhook: noopNull,
    getWebhooksForTenant: noopList,
    getWebhooksByEvent: noopList,
    deleteWebhook: noop,

    // Health
    ping: noopBool,

    ...overrides,
  } as StorageAdapter;
}

function createTestApp(storageOverrides: Partial<StorageAdapter> = {}) {
  const storage = makeStorage(storageOverrides);
  const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  app.onError(globalErrorHandler);

  // Set fake auth context (bypass real auth)
  app.use('*', async (c, next) => {
    c.set('requestId', 'req_test_000000000000');
    c.set('tenantId', TENANT_ID);
    c.set('tenantPlan', 'pro');
    c.set('apiKeyScopes', ['read', 'write', 'admin']);
    const adapters = { storage } as unknown as Adapters;
    c.set('adapters', adapters);
    await next();
  });

  // Mount memory routes
  app.route('/v1/memory', memoryRoutes);
  app.route('/v1/export', exportRoutes);

  return { app, storage };
}

function postJson(app: Hono, path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function deleteReq(app: Hono, path: string) {
  return app.request(path, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /v1/memory', () => {
  it('returns 202 with extraction_id for valid body', async () => {
    const { app } = createTestApp();

    const res = await postJson(app, '/v1/memory', {
      scope: 'user',
      scope_id: 'user_1',
      input_type: 'conversation',
      data: { messages: [{ role: 'user', content: 'I like dark mode' }] },
    });

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.extraction_id).toBeDefined();
    expect(body.status).toBe('queued');
    expect(body.poll_url).toContain('/v1/extractions/');
  });

  it('returns 202 for raw_text input', async () => {
    const { app } = createTestApp();

    const res = await postJson(app, '/v1/memory', {
      scope: 'user',
      scope_id: 'user_1',
      input_type: 'raw_text',
      data: 'Some raw text to extract from',
    });

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.extraction_id).toBeDefined();
    expect(body.status).toBe('queued');
  });

  it('creates an extraction record in storage', async () => {
    const { app, storage } = createTestApp();

    await postJson(app, '/v1/memory', {
      scope: 'user',
      scope_id: 'user_1',
      input_type: 'raw_text',
      data: 'Test text',
    });

    expect(storage.createExtraction).toHaveBeenCalledTimes(1);
    const call = (storage.createExtraction as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.tenantId).toBe(TENANT_ID);
    expect(call.inputType).toBe('raw_text');
    expect(call.scope).toBe('user');
    expect(call.scopeId).toBe('user_1');
    expect(call.id).toBeDefined();
    expect(call.inputHash).toBeDefined();
  });

  it('returns 400 when scope is missing', async () => {
    const { app } = createTestApp();

    const res = await postJson(app, '/v1/memory', {
      scope_id: 'user_1',
      input_type: 'raw_text',
      data: 'Some text',
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('bad_request');
  });

  it('returns 400 when input_type is invalid', async () => {
    const { app } = createTestApp();

    const res = await postJson(app, '/v1/memory', {
      scope: 'user',
      scope_id: 'user_1',
      input_type: 'invalid_type',
      data: 'Some text',
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('bad_request');
  });

  it('returns 400 when conversation data has no messages', async () => {
    const { app } = createTestApp();

    const res = await postJson(app, '/v1/memory', {
      scope: 'user',
      scope_id: 'user_1',
      input_type: 'conversation',
      data: { messages: [] },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('bad_request');
  });

  it('returns 409 when duplicate hash exists', async () => {
    const { app } = createTestApp({
      getExtractionByHash: vi.fn().mockResolvedValue({
        id: EXTRACTION_ID,
        status: 'completed',
      }),
    });

    const res = await postJson(app, '/v1/memory', {
      scope: 'user',
      scope_id: 'user_1',
      input_type: 'raw_text',
      data: 'Duplicate text',
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('conflict');
    expect(body.error.existing_extraction_id).toBe(EXTRACTION_ID);
  });

  it('accepts optional session_id', async () => {
    const sessionId = '00000000-0000-0000-0000-000000000099';
    const { app, storage } = createTestApp();

    const res = await postJson(app, '/v1/memory', {
      scope: 'user',
      scope_id: 'user_1',
      input_type: 'raw_text',
      data: 'Some text',
      session_id: sessionId,
    });

    expect(res.status).toBe(202);
    const call = (storage.createExtraction as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.sessionId).toBe(sessionId);
  });
});

describe('POST /v1/memory/batch', () => {
  it('returns 202 with extraction_ids for 3 items', async () => {
    const { app } = createTestApp();

    const items = [1, 2, 3].map((i) => ({
      scope: 'user',
      scope_id: `user_${i}`,
      input_type: 'raw_text',
      data: `Text ${i}`,
    }));

    const res = await postJson(app, '/v1/memory/batch', { items });
    expect(res.status).toBe(202);

    const body = await res.json();
    expect(body.extractions).toHaveLength(3);
    expect(body.status).toBe('queued');
    for (const ext of body.extractions) {
      expect(ext.extraction_id).toBeDefined();
      expect(ext.poll_url).toContain('/v1/extractions/');
    }
  });

  it('creates extraction records for each item', async () => {
    const { app, storage } = createTestApp();

    const items = [1, 2].map((i) => ({
      scope: 'user',
      scope_id: `user_${i}`,
      input_type: 'raw_text',
      data: `Text ${i}`,
    }));

    await postJson(app, '/v1/memory/batch', { items });
    expect(storage.createExtraction).toHaveBeenCalledTimes(2);
  });

  it('returns 400 when items exceed 50', async () => {
    const { app } = createTestApp();

    const items = Array.from({ length: 51 }, (_, i) => ({
      scope: 'user',
      scope_id: `user_${i}`,
      input_type: 'raw_text',
      data: `Text ${i}`,
    }));

    const res = await postJson(app, '/v1/memory/batch', { items });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('bad_request');
  });

  it('returns 400 when items array is empty', async () => {
    const { app } = createTestApp();

    const res = await postJson(app, '/v1/memory/batch', { items: [] });
    expect(res.status).toBe(400);
  });
});

describe('GET /v1/memory', () => {
  it('returns paginated facts for scope+scope_id', async () => {
    const fact = makeFact();
    const { app } = createTestApp({
      getFactsByScope: vi.fn().mockResolvedValue({
        data: [fact],
        cursor: 'next_cursor',
        hasMore: true,
      }),
    });

    const res = await app.request(
      '/v1/memory?scope=user&scope_id=user_1',
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.cursor).toBe('next_cursor');
    expect(body.has_more).toBe(true);
    // Wire format should be snake_case
    expect(body.data[0].scope_id).toBe('user_1');
  });

  it('returns 400 when scope is missing', async () => {
    const { app } = createTestApp();
    const res = await app.request('/v1/memory?scope_id=user_1');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('bad_request');
  });

  it('returns 400 when scope_id is missing', async () => {
    const { app } = createTestApp();
    const res = await app.request('/v1/memory?scope=user');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('bad_request');
  });

  it('clamps limit to max 100', async () => {
    const { app, storage } = createTestApp();

    await app.request(
      '/v1/memory?scope=user&scope_id=user_1&limit=500',
    );

    const call = (storage.getFactsByScope as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(call[3].limit).toBe(100);
  });

  it('defaults limit to 20', async () => {
    const { app, storage } = createTestApp();

    await app.request('/v1/memory?scope=user&scope_id=user_1');

    const call = (storage.getFactsByScope as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(call[3].limit).toBe(20);
  });

  it('passes cursor to storage', async () => {
    const { app, storage } = createTestApp();

    await app.request(
      '/v1/memory?scope=user&scope_id=user_1&cursor=abc123',
    );

    const call = (storage.getFactsByScope as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(call[3].cursor).toBe('abc123');
  });
});

describe('GET /v1/memory/:id', () => {
  it('returns 200 with fact data', async () => {
    const fact = makeFact();
    const { app } = createTestApp({
      getFact: vi.fn().mockResolvedValue(fact),
    });

    const res = await app.request(`/v1/memory/${FACT_ID}`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.id).toBe(FACT_ID);
    // Wire format: snake_case
    expect(body.data.scope_id).toBe('user_1');
    expect(body.data.tenant_id).toBe(TENANT_ID);
  });

  it('returns 404 for unknown fact', async () => {
    const { app } = createTestApp();

    const res = await app.request('/v1/memory/nonexistent-id');
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error.code).toBe('not_found');
  });
});

describe('DELETE /v1/memory/:id', () => {
  it('returns 200 and invalidates the fact', async () => {
    const fact = makeFact();
    const { app, storage } = createTestApp({
      getFact: vi.fn().mockResolvedValue(fact),
    });

    const res = await deleteReq(app, `/v1/memory/${FACT_ID}`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.id).toBe(FACT_ID);
    expect(body.data.invalidated).toBe(true);
    expect(storage.invalidateFact).toHaveBeenCalledWith(TENANT_ID, FACT_ID);
  });

  it('returns 404 when fact does not exist', async () => {
    const { app } = createTestApp();

    const res = await deleteReq(app, '/v1/memory/nonexistent-id');
    expect(res.status).toBe(404);
  });
});

describe('GET /v1/memory/:id/history', () => {
  it('returns 200 with version history', async () => {
    const fact = makeFact();
    const v1 = makeFact({ version: 1, validUntil: new Date('2025-06-01') });
    const v2 = makeFact({
      id: '00000000-0000-0000-0000-000000000011',
      version: 2,
      operation: 'update',
    });

    const { app } = createTestApp({
      getFact: vi.fn().mockResolvedValue(fact),
      getFactsByLineage: vi.fn().mockResolvedValue([v1, v2]),
    });

    const res = await app.request(`/v1/memory/${FACT_ID}/history`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.fact_id).toBe(FACT_ID);
    expect(body.data.lineage_id).toBe(LINEAGE_ID);
    expect(body.data.versions).toHaveLength(2);
  });

  it('returns 404 for unknown fact', async () => {
    const { app } = createTestApp();

    const res = await app.request('/v1/memory/unknown-id/history');
    expect(res.status).toBe(404);
  });
});

describe('DELETE /v1/memory/purge', () => {
  it('returns 200 with count of deleted facts', async () => {
    const { app } = createTestApp({
      purgeFacts: vi.fn().mockResolvedValue(42),
    });

    const res = await deleteReq(
      app,
      '/v1/memory/purge?scope=user&scope_id=user_1',
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.purged).toBe(true);
    expect(body.facts_deleted).toBe(42);
  });

  it('returns 400 when scope is missing', async () => {
    const { app } = createTestApp();

    const res = await deleteReq(app, '/v1/memory/purge?scope_id=user_1');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('bad_request');
  });

  it('returns 400 when scope_id is missing', async () => {
    const { app } = createTestApp();

    const res = await deleteReq(app, '/v1/memory/purge?scope=user');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('bad_request');
  });

  it('calls purgeFacts with correct args', async () => {
    const { app, storage } = createTestApp({
      purgeFacts: vi.fn().mockResolvedValue(0),
    });

    await deleteReq(
      app,
      '/v1/memory/purge?scope=agent&scope_id=agent_42',
    );

    expect(storage.purgeFacts).toHaveBeenCalledWith(
      TENANT_ID,
      'agent',
      'agent_42',
    );
  });
});

describe('GET /v1/export', () => {
  it('returns exported data in snake_case', async () => {
    const fact = makeFact();
    const { app } = createTestApp({
      getFactsByScope: vi.fn().mockResolvedValue({
        data: [fact],
        cursor: null,
        hasMore: false,
      }),
    });

    const res = await app.request(
      '/v1/export?scope=user&scope_id=user_1',
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.scope).toBe('user');
    expect(body.scope_id).toBe('user_1');
    expect(body.facts).toBeDefined();
    expect(body.entities).toBeDefined();
    expect(body.sessions).toBeDefined();
    expect(body.exported_at).toBeDefined();
  });

  it('returns 400 when scope is missing', async () => {
    const { app } = createTestApp();

    const res = await app.request('/v1/export?scope_id=user_1');
    expect(res.status).toBe(400);
  });

  it('returns 400 for unsupported format', async () => {
    const { app } = createTestApp();

    const res = await app.request(
      '/v1/export?scope=user&scope_id=user_1&format=csv',
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('bad_request');
  });
});

describe('wire format', () => {
  it('all responses use snake_case keys', async () => {
    const fact = makeFact();
    const { app } = createTestApp({
      getFact: vi.fn().mockResolvedValue(fact),
    });

    const res = await app.request(`/v1/memory/${FACT_ID}`);
    const body = await res.json();

    // These should be snake_case, not camelCase
    expect(body.data.tenant_id).toBeDefined();
    expect(body.data.scope_id).toBeDefined();
    expect(body.data.session_id).toBeDefined();
    expect(body.data.lineage_id).toBeDefined();
    expect(body.data.valid_from).toBeDefined();
    expect(body.data.created_at).toBeDefined();
    expect(body.data.embedding_model).toBeDefined();

    // camelCase keys should NOT exist
    expect(body.data.tenantId).toBeUndefined();
    expect(body.data.scopeId).toBeUndefined();
    expect(body.data.lineageId).toBeUndefined();
  });
});

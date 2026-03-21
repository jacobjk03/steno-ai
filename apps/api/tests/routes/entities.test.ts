import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import type { StorageAdapter } from '@steno-ai/engine';
import type { AppVariables } from '../../src/app.js';
import type { Env } from '../../src/env.js';
import type { Adapters } from '../../src/lib/adapters.js';
import { requestIdMiddleware } from '../../src/middleware/request-id.js';
import { globalErrorHandler } from '../../src/middleware/error-handler.js';
import { entities } from '../../src/routes/entities.js';

// Mock auth middleware to bypass authentication in route tests
vi.mock('../../src/middleware/auth.js', () => ({
  authMiddleware: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

// ---------- helpers ----------

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const ENTITY_ID = '00000000-0000-0000-0000-000000000020';

function makeStorage(overrides: Partial<StorageAdapter> = {}): StorageAdapter {
  const noop = vi.fn().mockResolvedValue(undefined);
  const noopNull = vi.fn().mockResolvedValue(null);
  const noopList = vi.fn().mockResolvedValue([]);
  const noopPaged = vi.fn().mockResolvedValue({ data: [], cursor: null, hasMore: false });
  const noopBool = vi.fn().mockResolvedValue(true);

  return {
    createFact: noop, getFact: noopNull, getFactsByIds: noopList, getFactsByLineage: noopList,
    getFactsByScope: noopPaged, invalidateFact: noop, purgeFacts: vi.fn().mockResolvedValue(0),
    updateDecayScores: noop, vectorSearch: noopList, keywordSearch: noopList,
    createEntity: noop, getEntity: noopNull, findEntityByCanonicalName: noopNull,
    getEntitiesForTenant: noopPaged, linkFactEntity: noop, getEntitiesForFact: noopList,
    getFactsForEntity: noopPaged, createEdge: noop, getEdgesForEntity: noopList,
    graphTraversal: vi.fn().mockResolvedValue({ entities: [], edges: [] }),
    createTrigger: noop, getTrigger: noopNull, getActiveTriggers: noopList,
    updateTrigger: noop, deleteTrigger: noop, incrementTriggerFired: noop,
    createMemoryAccess: noop, updateFeedback: noop,
    createExtraction: noop, getExtraction: noopNull, updateExtraction: noop,
    getExtractionByHash: noopNull, getExtractionsByTenant: noopPaged,
    createSession: noop, getSession: noopNull, endSession: noop, getSessionsByScope: noopPaged,
    createTenant: noop,
    getTenant: noopNull, getTenantBySlug: noopNull, updateTenant: noop,
    createApiKey: noop, getApiKeyByPrefix: noopNull, getApiKeysForTenant: noopList,
    revokeApiKey: noop, updateApiKeyLastUsed: noop,
    incrementUsage: noop, getUsage: noopNull, getCurrentUsage: noopNull,
    createWebhook: noop, getWebhook: noopNull, getWebhooksForTenant: noopList,
    getWebhooksByEvent: noopList, deleteWebhook: noop, ping: noopBool,
    ...overrides,
  } as StorageAdapter;
}

type HonoApp = Hono<{ Bindings: Env; Variables: AppVariables }>;

function buildApp(storage: StorageAdapter): HonoApp {
  const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();
  app.onError(globalErrorHandler);
  app.use('*', requestIdMiddleware());
  app.use('*', async (c, next) => {
    c.set('tenantId', TENANT_ID);
    c.set('tenantPlan', 'pro');
    c.set('apiKeyScopes', ['read', 'write']);
    const adapters = { storage } as unknown as Adapters;
    c.set('adapters' as never, adapters);
    await next();
  });
  app.route('/v1/entities', entities);
  return app;
}

const SAMPLE_ENTITY = {
  id: ENTITY_ID,
  tenantId: TENANT_ID,
  name: 'John Doe',
  entityType: 'person',
  canonicalName: 'john_doe',
  properties: { age: 30 },
  embeddingModel: null,
  embeddingDim: null,
  mergeTargetId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ---------- tests ----------

describe('GET /v1/entities', () => {
  it('returns paginated entities', async () => {
    const storage = makeStorage({
      getEntitiesForTenant: vi.fn().mockResolvedValue({
        data: [SAMPLE_ENTITY],
        cursor: 'next',
        hasMore: true,
      }),
    });
    const app = buildApp(storage);

    const res = await app.request('/v1/entities');
    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[]; cursor: string; has_more: boolean };
    expect(body.data).toHaveLength(1);
    expect(body.cursor).toBe('next');
    expect(body.has_more).toBe(true);
  });

  it('passes limit and cursor to storage', async () => {
    const storage = makeStorage();
    const app = buildApp(storage);

    await app.request('/v1/entities?limit=5&cursor=abc');
    expect(storage.getEntitiesForTenant).toHaveBeenCalledWith(
      TENANT_ID,
      { limit: 5, cursor: 'abc' },
    );
  });

  it('caps limit at 100', async () => {
    const storage = makeStorage();
    const app = buildApp(storage);

    await app.request('/v1/entities?limit=999');
    expect(storage.getEntitiesForTenant).toHaveBeenCalledWith(
      TENANT_ID,
      { limit: 100, cursor: undefined },
    );
  });
});

describe('GET /v1/entities/:id', () => {
  it('returns entity by id', async () => {
    const storage = makeStorage({
      getEntity: vi.fn().mockResolvedValue(SAMPLE_ENTITY),
    });
    const app = buildApp(storage);

    const res = await app.request(`/v1/entities/${ENTITY_ID}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: Record<string, unknown> };
    expect(body.data.name).toBe('John Doe');
    expect(body.data.entity_type).toBe('person');
  });

  it('returns 404 when entity not found', async () => {
    const app = buildApp(makeStorage());

    const res = await app.request(`/v1/entities/${ENTITY_ID}`);
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });
});

describe('GET /v1/entities/:id/graph', () => {
  it('returns entity with graph traversal', async () => {
    const storage = makeStorage({
      getEntity: vi.fn().mockResolvedValue(SAMPLE_ENTITY),
      graphTraversal: vi.fn().mockResolvedValue({
        entities: [SAMPLE_ENTITY],
        edges: [],
      }),
    });
    const app = buildApp(storage);

    const res = await app.request(`/v1/entities/${ENTITY_ID}/graph`);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { entity: Record<string, unknown>; graph: Record<string, unknown> } };
    expect(body.data.entity).toBeDefined();
    expect(body.data.graph).toBeDefined();
  });

  it('uses depth query param (default 3)', async () => {
    const storage = makeStorage({
      getEntity: vi.fn().mockResolvedValue(SAMPLE_ENTITY),
    });
    const app = buildApp(storage);

    await app.request(`/v1/entities/${ENTITY_ID}/graph`);
    expect(storage.graphTraversal).toHaveBeenCalledWith(
      expect.objectContaining({ maxDepth: 3 }),
    );
  });

  it('caps depth at 5', async () => {
    const storage = makeStorage({
      getEntity: vi.fn().mockResolvedValue(SAMPLE_ENTITY),
    });
    const app = buildApp(storage);

    await app.request(`/v1/entities/${ENTITY_ID}/graph?depth=10`);
    expect(storage.graphTraversal).toHaveBeenCalledWith(
      expect.objectContaining({ maxDepth: 5 }),
    );
  });

  it('returns 404 when entity not found', async () => {
    const app = buildApp(makeStorage());

    const res = await app.request(`/v1/entities/${ENTITY_ID}/graph`);
    expect(res.status).toBe(404);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import type { StorageAdapter } from '@steno-ai/engine';
import type { AppVariables } from '../../src/app.js';
import type { Env } from '../../src/env.js';
import type { Adapters } from '../../src/lib/adapters.js';
import { requestIdMiddleware } from '../../src/middleware/request-id.js';
import { globalErrorHandler } from '../../src/middleware/error-handler.js';
import { triggers } from '../../src/routes/triggers.js';

// Mock auth middleware to bypass authentication in route tests
vi.mock('../../src/middleware/auth.js', () => ({
  authMiddleware: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

// ---------- helpers ----------

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TRIGGER_ID = '00000000-0000-0000-0000-000000000030';

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
    createTrigger: vi.fn().mockImplementation(async (input: Record<string, unknown>) => ({
      id: input.id,
      tenantId: input.tenantId,
      scope: input.scope,
      scopeId: input.scopeId,
      condition: input.condition,
      factIds: input.factIds ?? [],
      entityIds: input.entityIds ?? [],
      queryTemplate: input.queryTemplate ?? null,
      priority: input.priority ?? 0,
      active: true,
      timesFired: 0,
      lastFiredAt: null,
      createdAt: new Date(),
    })),
    getTrigger: noopNull, getActiveTriggers: noopList,
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
  app.route('/v1/triggers', triggers);
  return app;
}

const SAMPLE_TRIGGER = {
  id: TRIGGER_ID,
  tenantId: TENANT_ID,
  scope: 'user' as const,
  scopeId: 'user-123',
  condition: { topic_match: ['test'] },
  factIds: [],
  entityIds: [],
  queryTemplate: null,
  priority: 0,
  active: true,
  timesFired: 0,
  lastFiredAt: null,
  createdAt: new Date(),
};

// ---------- tests ----------

describe('POST /v1/triggers', () => {
  it('creates a trigger and returns 201', async () => {
    const storage = makeStorage();
    const app = buildApp(storage);

    const res = await app.request('/v1/triggers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'user',
        scope_id: 'user-123',
        condition: { topic_match: ['test'] },
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { data: Record<string, unknown> };
    expect(body.data.scope).toBe('user');
    expect(body.data.scope_id).toBe('user-123');
    expect(storage.createTrigger).toHaveBeenCalledOnce();
  });

  it('returns 400 when condition is missing', async () => {
    const app = buildApp(makeStorage());

    const res = await app.request('/v1/triggers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'user', scope_id: 'user-123' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when scope is missing', async () => {
    const app = buildApp(makeStorage());

    const res = await app.request('/v1/triggers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope_id: 'user-123', condition: {} }),
    });

    expect(res.status).toBe(400);
  });
});

describe('GET /v1/triggers', () => {
  it('returns active triggers for scope', async () => {
    const storage = makeStorage({
      getActiveTriggers: vi.fn().mockResolvedValue([SAMPLE_TRIGGER]),
    });
    const app = buildApp(storage);

    const res = await app.request('/v1/triggers?scope=user&scope_id=user-123');
    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[] };
    expect(body.data).toHaveLength(1);
  });

  it('returns 400 when scope is missing', async () => {
    const app = buildApp(makeStorage());

    const res = await app.request('/v1/triggers?scope_id=user-123');
    expect(res.status).toBe(400);
  });

  it('returns 400 when scope_id is missing', async () => {
    const app = buildApp(makeStorage());

    const res = await app.request('/v1/triggers?scope=user');
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid scope', async () => {
    const app = buildApp(makeStorage());

    const res = await app.request('/v1/triggers?scope=invalid&scope_id=user-123');
    expect(res.status).toBe(400);
  });
});

describe('PATCH /v1/triggers/:id', () => {
  it('updates a trigger', async () => {
    const updated = { ...SAMPLE_TRIGGER, priority: 5 };
    const storage = makeStorage({
      getTrigger: vi.fn().mockResolvedValue(SAMPLE_TRIGGER),
      updateTrigger: vi.fn().mockResolvedValue(updated),
    });
    const app = buildApp(storage);

    const res = await app.request(`/v1/triggers/${TRIGGER_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority: 5 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { data: Record<string, unknown> };
    expect(body.data.priority).toBe(5);
  });

  it('returns 404 when trigger not found', async () => {
    const app = buildApp(makeStorage());

    const res = await app.request(`/v1/triggers/${TRIGGER_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority: 5 }),
    });

    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });
});

describe('DELETE /v1/triggers/:id', () => {
  it('deletes a trigger', async () => {
    const storage = makeStorage({
      getTrigger: vi.fn().mockResolvedValue(SAMPLE_TRIGGER),
    });
    const app = buildApp(storage);

    const res = await app.request(`/v1/triggers/${TRIGGER_ID}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { deleted: boolean } };
    expect(body.data.deleted).toBe(true);
    expect(storage.deleteTrigger).toHaveBeenCalledWith(TENANT_ID, TRIGGER_ID);
  });

  it('returns 404 when trigger not found', async () => {
    const app = buildApp(makeStorage());

    const res = await app.request(`/v1/triggers/${TRIGGER_ID}`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});

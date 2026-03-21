import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import type { StorageAdapter, LLMAdapter } from '@steno-ai/engine';
import type { AppVariables } from '../../src/app.js';
import type { Env } from '../../src/env.js';
import type { Adapters } from '../../src/lib/adapters.js';
import { requestIdMiddleware } from '../../src/middleware/request-id.js';
import { globalErrorHandler } from '../../src/middleware/error-handler.js';
import { sessions } from '../../src/routes/sessions.js';

// Mock auth middleware to bypass authentication in route tests
vi.mock('../../src/middleware/auth.js', () => ({
  authMiddleware: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

// ---------- helpers ----------

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const SESSION_ID = '00000000-0000-0000-0000-000000000010';

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
    createSession: vi.fn().mockImplementation(async (input: Record<string, unknown>) => ({
      id: input.id,
      tenantId: input.tenantId,
      scope: input.scope,
      scopeId: input.scopeId,
      startedAt: new Date(),
      endedAt: null,
      summary: null,
      topics: [],
      messageCount: 0,
      factCount: 0,
      metadata: input.metadata ?? {},
      createdAt: new Date(),
    })),
    getSession: noopNull, endSession: noop,
    getSessionsByScope: noopPaged,
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

function makeLLM(): LLMAdapter {
  return {
    complete: vi.fn().mockResolvedValue({ content: '{"summary":"test","topics":["a"]}', inputTokens: 10, outputTokens: 10 }),
  } as unknown as LLMAdapter;
}

type HonoApp = Hono<{ Bindings: Env; Variables: AppVariables }>;

function buildApp(storage: StorageAdapter, llm?: LLMAdapter): HonoApp {
  const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();
  app.onError(globalErrorHandler);
  app.use('*', requestIdMiddleware());
  // Inject mock adapters and tenant context (auth is mocked above)
  app.use('*', async (c, next) => {
    c.set('tenantId', TENANT_ID);
    c.set('tenantPlan', 'pro');
    c.set('apiKeyScopes', ['read', 'write']);
    const adapters = { storage, cheapLLM: llm ?? makeLLM() } as unknown as Adapters;
    c.set('adapters' as never, adapters);
    await next();
  });
  app.route('/v1/sessions', sessions);
  return app;
}

// ---------- tests ----------

describe('POST /v1/sessions', () => {
  it('creates a new session and returns 201', async () => {
    const storage = makeStorage();
    const app = buildApp(storage);

    const res = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'user', scope_id: 'user-123' }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { data: Record<string, unknown> };
    expect(body.data.scope).toBe('user');
    expect(body.data.scope_id).toBe('user-123');
    expect(body.data.ended_at).toBeNull();
    expect(storage.createSession).toHaveBeenCalledOnce();
  });

  it('returns 400 when scope is missing', async () => {
    const app = buildApp(makeStorage());

    const res = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope_id: 'user-123' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('bad_request');
  });

  it('returns 400 when scope_id is missing', async () => {
    const app = buildApp(makeStorage());

    const res = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'user' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('bad_request');
  });

  it('accepts optional metadata', async () => {
    const storage = makeStorage();
    const app = buildApp(storage);

    const res = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'agent', scope_id: 'agent-1', metadata: { key: 'val' } }),
    });

    expect(res.status).toBe(201);
  });
});

describe('POST /v1/sessions/:id/end', () => {
  it('ends a session and returns 200', async () => {
    const storage = makeStorage({
      getSession: vi.fn().mockResolvedValue({
        id: SESSION_ID, tenantId: TENANT_ID, scope: 'user', scopeId: 'user-123',
        startedAt: new Date(), endedAt: null, summary: null, topics: [],
        messageCount: 0, factCount: 0, metadata: {}, createdAt: new Date(),
      }),
      getFactsByScope: vi.fn().mockResolvedValue({ data: [], cursor: null, hasMore: false }),
      endSession: vi.fn().mockResolvedValue({
        id: SESSION_ID, tenantId: TENANT_ID, scope: 'user', scopeId: 'user-123',
        startedAt: new Date(), endedAt: new Date(), summary: 'test summary',
        topics: ['a'], messageCount: 0, factCount: 0, metadata: {}, createdAt: new Date(),
      }),
    });
    const app = buildApp(storage);

    const res = await app.request(`/v1/sessions/${SESSION_ID}/end`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json() as { data: Record<string, unknown> };
    expect(body.data.ended_at).toBeDefined();
  });

  it('returns 404 when session does not exist', async () => {
    const storage = makeStorage({
      getSession: vi.fn().mockResolvedValue(null),
    });
    const app = buildApp(storage);

    const res = await app.request(`/v1/sessions/${SESSION_ID}/end`, { method: 'POST' });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });

  it('returns 400 when session is already ended', async () => {
    const storage = makeStorage({
      getSession: vi.fn().mockResolvedValue({
        id: SESSION_ID, tenantId: TENANT_ID, scope: 'user', scopeId: 'user-123',
        startedAt: new Date(), endedAt: new Date(), summary: 'done', topics: [],
        messageCount: 0, factCount: 0, metadata: {}, createdAt: new Date(),
      }),
    });
    const app = buildApp(storage);

    const res = await app.request(`/v1/sessions/${SESSION_ID}/end`, { method: 'POST' });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('bad_request');
  });
});

describe('GET /v1/sessions', () => {
  it('returns paginated sessions', async () => {
    const now = new Date();
    const storage = makeStorage({
      getSessionsByScope: vi.fn().mockResolvedValue({
        data: [
          { id: SESSION_ID, tenantId: TENANT_ID, scope: 'user', scopeId: 'user-123',
            startedAt: now, endedAt: null, summary: null, topics: [],
            messageCount: 0, factCount: 0, metadata: {}, createdAt: now },
        ],
        cursor: 'next-cursor',
        hasMore: true,
      }),
    });
    const app = buildApp(storage);

    const res = await app.request('/v1/sessions?scope=user&scope_id=user-123');
    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[]; cursor: string; has_more: boolean };
    expect(body.data).toHaveLength(1);
    expect(body.cursor).toBe('next-cursor');
    expect(body.has_more).toBe(true);
  });

  it('returns 400 when scope is missing', async () => {
    const app = buildApp(makeStorage());

    const res = await app.request('/v1/sessions?scope_id=user-123');
    expect(res.status).toBe(400);
  });

  it('returns 400 when scope_id is missing', async () => {
    const app = buildApp(makeStorage());

    const res = await app.request('/v1/sessions?scope=user');
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid scope', async () => {
    const app = buildApp(makeStorage());

    const res = await app.request('/v1/sessions?scope=invalid&scope_id=user-123');
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain('Invalid scope');
  });
});

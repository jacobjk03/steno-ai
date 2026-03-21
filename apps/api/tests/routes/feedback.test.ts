import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import type { StorageAdapter } from '@steno-ai/engine';
import type { AppVariables } from '../../src/app.js';
import type { Env } from '../../src/env.js';
import type { Adapters } from '../../src/lib/adapters.js';
import { requestIdMiddleware } from '../../src/middleware/request-id.js';
import { globalErrorHandler } from '../../src/middleware/error-handler.js';
import { feedback } from '../../src/routes/feedback.js';

// Mock auth middleware to bypass authentication in route tests
vi.mock('../../src/middleware/auth.js', () => ({
  authMiddleware: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

// ---------- helpers ----------

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const FACT_ID = '00000000-0000-0000-0000-000000000040';
const FACT_ID_2 = '00000000-0000-0000-0000-000000000041';

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
  app.route('/v1/feedback', feedback);
  return app;
}

// ---------- tests ----------

describe('POST /v1/feedback', () => {
  it('submits feedback and returns 201', async () => {
    const storage = makeStorage({
      getFact: vi.fn().mockResolvedValue({
        id: FACT_ID, tenantId: TENANT_ID, importance: 0.5, frequency: 1,
        lastAccessed: new Date(), content: 'test',
      }),
    });
    const app = buildApp(storage);

    const res = await app.request('/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fact_id: FACT_ID,
        was_useful: true,
        feedback_type: 'explicit_positive',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { data: { submitted: boolean } };
    expect(body.data.submitted).toBe(true);
    expect(storage.updateFeedback).toHaveBeenCalled();
  });

  it('returns 400 when fact_id is missing', async () => {
    const app = buildApp(makeStorage());

    const res = await app.request('/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ was_useful: true, feedback_type: 'explicit_positive' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when feedback_type is invalid', async () => {
    const app = buildApp(makeStorage());

    const res = await app.request('/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fact_id: FACT_ID,
        was_useful: true,
        feedback_type: 'not_a_valid_type',
      }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when was_useful is missing', async () => {
    const app = buildApp(makeStorage());

    const res = await app.request('/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fact_id: FACT_ID,
        feedback_type: 'explicit_positive',
      }),
    });

    expect(res.status).toBe(400);
  });

  it('includes optional feedback_detail', async () => {
    const storage = makeStorage({
      getFact: vi.fn().mockResolvedValue({
        id: FACT_ID, tenantId: TENANT_ID, importance: 0.5, frequency: 1,
        lastAccessed: new Date(), content: 'test',
      }),
    });
    const app = buildApp(storage);

    const res = await app.request('/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fact_id: FACT_ID,
        was_useful: false,
        feedback_type: 'correction',
        feedback_detail: 'The fact was incorrect',
      }),
    });

    expect(res.status).toBe(201);
    expect(storage.updateFeedback).toHaveBeenCalled();
  });
});

describe('POST /v1/feedback/batch', () => {
  it('submits batch feedback and returns 201', async () => {
    const storage = makeStorage({
      getFact: vi.fn().mockResolvedValue({
        id: FACT_ID, tenantId: TENANT_ID, importance: 0.5, frequency: 1,
        lastAccessed: new Date(), content: 'test',
      }),
    });
    const app = buildApp(storage);

    const res = await app.request('/v1/feedback/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          { fact_id: FACT_ID, was_useful: true, feedback_type: 'explicit_positive' },
          { fact_id: FACT_ID_2, was_useful: false, feedback_type: 'explicit_negative' },
        ],
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { data: { results: Array<{ fact_id: string; success: boolean }> } };
    expect(body.data.results).toHaveLength(2);
  });

  it('returns 400 when items is empty', async () => {
    const app = buildApp(makeStorage());

    const res = await app.request('/v1/feedback/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [] }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when items exceeds 50', async () => {
    const app = buildApp(makeStorage());

    const items = Array.from({ length: 51 }, (_, i) => ({
      fact_id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
      was_useful: true,
      feedback_type: 'explicit_positive',
    }));

    const res = await app.request('/v1/feedback/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });

    expect(res.status).toBe(400);
  });

  it('handles partial failures in batch gracefully', async () => {
    const storage = makeStorage({
      updateFeedback: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('db error')),
      getFact: vi.fn()
        .mockResolvedValueOnce({
          id: FACT_ID, tenantId: TENANT_ID, importance: 0.5, frequency: 1,
          lastAccessed: new Date(), content: 'test',
        })
        .mockResolvedValueOnce(null),
    });
    const app = buildApp(storage);

    const res = await app.request('/v1/feedback/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          { fact_id: FACT_ID, was_useful: true, feedback_type: 'explicit_positive' },
          { fact_id: FACT_ID_2, was_useful: false, feedback_type: 'explicit_negative' },
        ],
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { data: { results: Array<{ success: boolean }> } };
    expect(body.data.results).toHaveLength(2);
    expect(body.data.results[0]!.success).toBe(true);
  });
});

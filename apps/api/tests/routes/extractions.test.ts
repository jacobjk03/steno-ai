import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import type { StorageAdapter } from '@steno-ai/engine';
import type { AppVariables } from '../../src/app.js';
import type { Env } from '../../src/env.js';
import type { Adapters } from '../../src/lib/adapters.js';
import { requestIdMiddleware } from '../../src/middleware/request-id.js';
import { globalErrorHandler } from '../../src/middleware/error-handler.js';
import { extractions } from '../../src/routes/extractions.js';

// Mock auth middleware to bypass authentication in route tests
vi.mock('../../src/middleware/auth.js', () => ({
  authMiddleware: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

// ---------- helpers ----------

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const EXTRACTION_ID = '00000000-0000-0000-0000-000000000050';

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
  app.route('/v1/extractions', extractions);
  return app;
}

const SAMPLE_EXTRACTION = {
  id: EXTRACTION_ID,
  tenantId: TENANT_ID,
  status: 'completed' as const,
  inputType: 'conversation' as const,
  inputData: null,
  inputHash: 'abc123',
  inputSize: 500,
  scope: 'user' as const,
  scopeId: 'user-123',
  sessionId: null,
  tierUsed: 'cheap_llm' as const,
  llmModel: 'gpt-4.1-nano',
  factsCreated: 3,
  factsUpdated: 1,
  factsInvalidated: 0,
  entitiesCreated: 2,
  edgesCreated: 1,
  costTokensInput: 150,
  costTokensOutput: 50,
  costUsd: 0.001,
  durationMs: 1200,
  error: null,
  retryCount: 0,
  createdAt: new Date(),
  completedAt: new Date(),
};

// ---------- tests ----------

describe('GET /v1/extractions', () => {
  it('returns paginated extractions', async () => {
    const storage = makeStorage({
      getExtractionsByTenant: vi.fn().mockResolvedValue({
        data: [SAMPLE_EXTRACTION],
        cursor: 'next',
        hasMore: true,
      }),
    });
    const app = buildApp(storage);

    const res = await app.request('/v1/extractions');
    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[]; cursor: string; has_more: boolean };
    expect(body.data).toHaveLength(1);
    expect(body.cursor).toBe('next');
    expect(body.has_more).toBe(true);
  });

  it('passes limit and cursor to storage', async () => {
    const storage = makeStorage();
    const app = buildApp(storage);

    await app.request('/v1/extractions?limit=10&cursor=xyz');
    expect(storage.getExtractionsByTenant).toHaveBeenCalledWith(
      TENANT_ID,
      { limit: 10, cursor: 'xyz' },
    );
  });

  it('caps limit at 100', async () => {
    const storage = makeStorage();
    const app = buildApp(storage);

    await app.request('/v1/extractions?limit=500');
    expect(storage.getExtractionsByTenant).toHaveBeenCalledWith(
      TENANT_ID,
      { limit: 100, cursor: undefined },
    );
  });

  it('defaults limit to 20', async () => {
    const storage = makeStorage();
    const app = buildApp(storage);

    await app.request('/v1/extractions');
    expect(storage.getExtractionsByTenant).toHaveBeenCalledWith(
      TENANT_ID,
      { limit: 20, cursor: undefined },
    );
  });
});

describe('GET /v1/extractions/:id', () => {
  it('returns extraction by id', async () => {
    const storage = makeStorage({
      getExtraction: vi.fn().mockResolvedValue(SAMPLE_EXTRACTION),
    });
    const app = buildApp(storage);

    const res = await app.request(`/v1/extractions/${EXTRACTION_ID}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: Record<string, unknown> };
    expect(body.data.status).toBe('completed');
    expect(body.data.facts_created).toBe(3);
    expect(body.data.input_type).toBe('conversation');
  });

  it('returns 404 when extraction not found', async () => {
    const app = buildApp(makeStorage());

    const res = await app.request(`/v1/extractions/${EXTRACTION_ID}`);
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });

  it('converts camelCase fields to snake_case in response', async () => {
    const storage = makeStorage({
      getExtraction: vi.fn().mockResolvedValue(SAMPLE_EXTRACTION),
    });
    const app = buildApp(storage);

    const res = await app.request(`/v1/extractions/${EXTRACTION_ID}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: Record<string, unknown> };
    // Verify snake_case conversion
    expect(body.data.tenant_id).toBe(TENANT_ID);
    expect(body.data.input_hash).toBe('abc123');
    expect(body.data.cost_tokens_input).toBe(150);
    expect(body.data.duration_ms).toBe(1200);
  });
});

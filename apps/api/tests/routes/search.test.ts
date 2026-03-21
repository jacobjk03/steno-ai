import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { AppVariables } from '../../src/app.js';
import type { Env } from '../../src/env.js';
import type { Adapters } from '../../src/lib/adapters.js';
import type { StorageAdapter, EmbeddingAdapter, SearchResponse } from '@steno-ai/engine';
import { searchRoutes } from '../../src/routes/search.js';

// ---------- mock engine search ----------

const mockSearchResult: SearchResponse = {
  results: [
    {
      fact: {
        id: 'fact-1',
        tenantId: 'tenant-1',
        scope: 'user',
        scopeId: 'user-1',
        content: 'The sky is blue',
        embedding: [],
        lineageId: 'lineage-1',
        version: 1,
        status: 'active',
        confidence: 0.95,
        extractionId: 'ext-1',
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
        lastAccessedAt: null,
        accessCount: 0,
        decayScore: 1.0,
      },
      score: 0.85,
      signals: {
        vectorScore: 0.9,
        keywordScore: 0.7,
        graphScore: 0.0,
        recencyScore: 0.8,
        salienceScore: 0.6,
      },
    },
  ],
  triggersMatched: [],
  totalCandidates: 5,
  durationMs: 42,
};

const mockSearch = vi.fn<() => Promise<SearchResponse>>().mockResolvedValue(mockSearchResult);

vi.mock('@steno-ai/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@steno-ai/engine')>();
  return {
    ...actual,
    search: (...args: unknown[]) => mockSearch(...(args as [])),
  };
});

// Mock auth middleware to bypass authentication in route tests
vi.mock('../../src/middleware/auth.js', () => ({
  authMiddleware: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

// ---------- helpers ----------

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

function makeStorage(): StorageAdapter {
  const noop = vi.fn().mockResolvedValue(undefined);
  const noopNull = vi.fn().mockResolvedValue(null);
  const noopList = vi.fn().mockResolvedValue([]);
  const noopPaged = vi.fn().mockResolvedValue({ data: [], cursor: null, hasMore: false });
  const noopBool = vi.fn().mockResolvedValue(true);

  return {
    createFact: noop,
    getFact: noopNull,
    getFactsByIds: noopList,
    getFactsByLineage: noopList,
    getFactsByScope: noopPaged,
    invalidateFact: noop,
    purgeFacts: vi.fn().mockResolvedValue(0),
    updateDecayScores: noop,
    vectorSearch: noopList,
    keywordSearch: noopList,
    createEntity: noop,
    getEntity: noopNull,
    findEntityByCanonicalName: noopNull,
    getEntitiesForTenant: noopPaged,
    linkFactEntity: noop,
    getEntitiesForFact: noopList,
    getFactsForEntity: noopPaged,
    createEdge: noop,
    getEdgesForEntity: noopList,
    graphTraversal: vi.fn().mockResolvedValue({ entities: [], edges: [] }),
    createTrigger: noop,
    getTrigger: noopNull,
    getActiveTriggers: noopList,
    updateTrigger: noop,
    deleteTrigger: noop,
    incrementTriggerFired: noop,
    createMemoryAccess: noop,
    updateFeedback: noop,
    createExtraction: noop,
    getExtraction: noopNull,
    updateExtraction: noop,
    getExtractionByHash: noopNull,
    getExtractionsByTenant: noopPaged,
    createSession: noop,
    getSession: noopNull,
    endSession: noop,
    getSessionsByScope: noopPaged,
    createTenant: noop,
    getTenant: noopNull,
    getTenantBySlug: noopNull,
    updateTenant: noop,
    createApiKey: noop,
    getApiKeyByPrefix: noopNull,
    getApiKeysForTenant: noopList,
    revokeApiKey: noop,
    updateApiKeyLastUsed: noop,
    incrementUsage: noop,
    getUsage: noopNull,
    getCurrentUsage: noopNull,
    createWebhook: noop,
    getWebhook: noopNull,
    getWebhooksForTenant: noopList,
    getWebhooksByEvent: noopList,
    deleteWebhook: noop,
    ping: noopBool,
  } as StorageAdapter;
}

function makeEmbedding(): EmbeddingAdapter {
  return {
    embed: vi.fn().mockResolvedValue(new Array(1536).fill(0)),
    embedBatch: vi.fn().mockResolvedValue([]),
    model: 'text-embedding-3-small',
    dimensions: 1536,
  };
}

function buildApp(): Hono<{ Bindings: Env; Variables: AppVariables }> {
  const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();
  const storage = makeStorage();
  const embedding = makeEmbedding();

  // Inject mock adapters and bypass auth by setting context directly
  app.use('*', async (c, next) => {
    const adapters = { storage, embedding } as unknown as Adapters;
    c.set('adapters' as never, adapters);
    c.set('tenantId', TENANT_ID);
    c.set('tenantPlan', 'pro');
    c.set('apiKeyScopes', ['read', 'write']);
    await next();
  });

  app.route('/v1/memory/search', searchRoutes);
  return app;
}

function post(app: ReturnType<typeof buildApp>, path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------- tests ----------

describe('POST /v1/memory/search', () => {
  beforeEach(() => {
    mockSearch.mockClear();
    mockSearch.mockResolvedValue(mockSearchResult);
  });

  it('returns 200 with results for a valid body', async () => {
    const app = buildApp();
    const res = await post(app, '/v1/memory/search', {
      query: 'what color is the sky',
      scope: 'user',
      scope_id: 'user-1',
    });

    expect(res.status).toBe(200);
    const json = await res.json() as Record<string, unknown>;
    expect(json.data).toBeDefined();
    expect(mockSearch).toHaveBeenCalledOnce();
  });

  it('returns 400 when query is missing', async () => {
    const app = buildApp();
    const res = await post(app, '/v1/memory/search', {
      scope: 'user',
      scope_id: 'user-1',
    });

    expect(res.status).toBe(400);
    const json = await res.json() as { error: { code: string } };
    expect(json.error.code).toBe('bad_request');
  });

  it('returns 400 when scope is missing', async () => {
    const app = buildApp();
    const res = await post(app, '/v1/memory/search', {
      query: 'test query',
      scope_id: 'user-1',
    });

    expect(res.status).toBe(400);
    const json = await res.json() as { error: { code: string } };
    expect(json.error.code).toBe('bad_request');
  });

  it('returns 400 when query exceeds 5000 characters', async () => {
    const app = buildApp();
    const res = await post(app, '/v1/memory/search', {
      query: 'x'.repeat(5001),
      scope: 'user',
      scope_id: 'user-1',
    });

    expect(res.status).toBe(400);
    const json = await res.json() as { error: { code: string } };
    expect(json.error.code).toBe('bad_request');
  });

  it('passes custom weights through to search', async () => {
    const app = buildApp();
    const weights = {
      vector: 0.5,
      keyword: 0.1,
      graph: 0.2,
      recency: 0.1,
      salience: 0.1,
    };

    const res = await post(app, '/v1/memory/search', {
      query: 'test',
      scope: 'user',
      scope_id: 'user-1',
      weights,
    });

    expect(res.status).toBe(200);
    expect(mockSearch).toHaveBeenCalledOnce();
    const callArgs = mockSearch.mock.calls[0] as unknown[];
    const options = callArgs[1] as Record<string, unknown>;
    expect(options.weights).toEqual(weights);
  });

  it('passes temporal filter through to search', async () => {
    const app = buildApp();
    const res = await post(app, '/v1/memory/search', {
      query: 'test',
      scope: 'user',
      scope_id: 'user-1',
      temporal_filter: {
        as_of: '2025-06-01T00:00:00.000Z',
      },
    });

    expect(res.status).toBe(200);
    expect(mockSearch).toHaveBeenCalledOnce();
    const callArgs = mockSearch.mock.calls[0] as unknown[];
    const options = callArgs[1] as { temporalFilter: { asOf: Date } };
    expect(options.temporalFilter).toBeDefined();
    expect(options.temporalFilter!.asOf).toBeInstanceOf(Date);
  });

  it('defaults limit to 10', async () => {
    const app = buildApp();
    await post(app, '/v1/memory/search', {
      query: 'test',
      scope: 'user',
      scope_id: 'user-1',
    });

    expect(mockSearch).toHaveBeenCalledOnce();
    const callArgs = mockSearch.mock.calls[0] as unknown[];
    const options = callArgs[1] as { limit: number };
    expect(options.limit).toBe(10);
  });

  it('returns 400 when limit exceeds 100', async () => {
    const app = buildApp();
    const res = await post(app, '/v1/memory/search', {
      query: 'test',
      scope: 'user',
      scope_id: 'user-1',
      limit: 101,
    });

    expect(res.status).toBe(400);
    const json = await res.json() as { error: { code: string } };
    expect(json.error.code).toBe('bad_request');
  });

  it('returns response in snake_case wire format', async () => {
    const app = buildApp();
    const res = await post(app, '/v1/memory/search', {
      query: 'test',
      scope: 'user',
      scope_id: 'user-1',
    });

    expect(res.status).toBe(200);
    const json = await res.json() as { data: Record<string, unknown> };
    const data = json.data as Record<string, unknown>;
    // Keys should be snake_case
    expect(data).toHaveProperty('triggers_matched');
    expect(data).toHaveProperty('total_candidates');
    expect(data).toHaveProperty('duration_ms');

    const results = data.results as Array<Record<string, unknown>>;
    expect(results.length).toBeGreaterThan(0);
    const result = results[0];
    const signals = result.signals as Record<string, unknown>;
    expect(signals).toHaveProperty('vector_score');
    expect(signals).toHaveProperty('keyword_score');
    expect(signals).toHaveProperty('graph_score');
    expect(signals).toHaveProperty('recency_score');
    expect(signals).toHaveProperty('salience_score');
  });
});

describe('POST /v1/memory/search/batch', () => {
  beforeEach(() => {
    mockSearch.mockClear();
    mockSearch.mockResolvedValue(mockSearchResult);
  });

  it('returns 200 with 3 results for 3 queries', async () => {
    const app = buildApp();
    const queries = [
      { query: 'q1', scope: 'user', scope_id: 'u1' },
      { query: 'q2', scope: 'user', scope_id: 'u2' },
      { query: 'q3', scope: 'user', scope_id: 'u3' },
    ];

    const res = await post(app, '/v1/memory/search/batch', { queries });

    expect(res.status).toBe(200);
    const json = await res.json() as { data: { results: unknown[] } };
    expect(json.data.results).toHaveLength(3);
    expect(mockSearch).toHaveBeenCalledTimes(3);
  });

  it('returns 400 when batch has more than 50 queries', async () => {
    const app = buildApp();
    const queries = Array.from({ length: 51 }, (_, i) => ({
      query: `q${i}`,
      scope: 'user',
      scope_id: `u${i}`,
    }));

    const res = await post(app, '/v1/memory/search/batch', { queries });

    expect(res.status).toBe(400);
    const json = await res.json() as { error: { code: string } };
    expect(json.error.code).toBe('bad_request');
  });
});

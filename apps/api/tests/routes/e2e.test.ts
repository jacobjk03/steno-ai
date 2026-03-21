import { describe, it, expect, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import type { StorageAdapter } from '@steno-ai/engine';
import type { Adapters } from '../../src/lib/adapters.js';

// ---------------------------------------------------------------------------
// Mock the auth module so authMiddleware actually rejects without a token
// (don't bypass auth — we want to test 401 behavior for unauthenticated)
// ---------------------------------------------------------------------------

// We do NOT mock auth here. The real authMiddleware calls getAdapters(c) which
// calls createAdapters(c.env) — so we need to intercept that.

// Instead we mock createAdapters at the module level so that the context helper
// returns a mock storage adapter (needed for auth to look up the API key).
vi.mock('../../src/lib/adapters.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/adapters.js')>();
  return {
    ...actual,
    createAdapters: (): Adapters => {
      const noop = vi.fn().mockResolvedValue(undefined);
      const noopNull = vi.fn().mockResolvedValue(null);
      const noopList = vi.fn().mockResolvedValue([]);
      const noopPaged = vi.fn().mockResolvedValue({ data: [], cursor: null, hasMore: false });
      const noopBool = vi.fn().mockResolvedValue(true);

      const storage: StorageAdapter = {
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

      return {
        storage,
        embedding: {
          embed: vi.fn().mockResolvedValue(new Array(1536).fill(0)),
          embedBatch: vi.fn().mockResolvedValue([]),
          model: 'text-embedding-3-small',
          dimensions: 1536,
        },
        cheapLLM: { generate: vi.fn().mockResolvedValue('mocked') },
        smartLLM: { generate: vi.fn().mockResolvedValue('mocked') },
        cache: {
          get: vi.fn().mockResolvedValue(null),
          set: vi.fn().mockResolvedValue(undefined),
          delete: vi.fn().mockResolvedValue(undefined),
        },
      } as unknown as Adapters;
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApp() {
  return createApp();
}

function postJson(app: ReturnType<typeof makeApp>, path: string, body: unknown, headers?: Record<string, string>) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// E2E smoke tests — assembled app
// ---------------------------------------------------------------------------

describe('E2E smoke: assembled app', () => {
  describe('GET /health', () => {
    it('returns 200 with no auth required', async () => {
      const app = makeApp();
      const res = await app.request('/health');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();
    });

    it('includes X-Request-Id header', async () => {
      const app = makeApp();
      const res = await app.request('/health');

      expect(res.status).toBe(200);
      const requestId = res.headers.get('X-Request-Id');
      expect(requestId).toBeTruthy();
      expect(requestId!.startsWith('req_')).toBe(true);
    });

    it('includes CORS headers', async () => {
      const app = makeApp();
      const res = await app.request('/health', {
        headers: { Origin: 'https://example.com' },
      });

      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  describe('unauthenticated requests return 401', () => {
    it('POST /v1/memory/search without auth returns 401', async () => {
      const app = makeApp();
      const res = await postJson(app, '/v1/memory/search', {
        query: 'test',
        scope: 'user',
        scopeId: 'user-1',
      });

      expect(res.status).toBe(401);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('unauthorized');
    });

    it('GET /v1/memory without auth returns 401', async () => {
      const app = makeApp();
      const res = await app.request('/v1/memory?scope=user&scope_id=u1');

      expect(res.status).toBe(401);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('unauthorized');
    });

    it('POST /v1/triggers without auth returns 401', async () => {
      const app = makeApp();
      const res = await postJson(app, '/v1/triggers', {
        scope: 'user',
        scopeId: 'u1',
        condition: {},
      });

      expect(res.status).toBe(401);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('unauthorized');
    });

    it('GET /v1/sessions without auth returns 401', async () => {
      const app = makeApp();
      const res = await app.request('/v1/sessions?scope=user&scope_id=u1');

      expect(res.status).toBe(401);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('unauthorized');
    });

    it('GET /v1/entities without auth returns 401', async () => {
      const app = makeApp();
      const res = await app.request('/v1/entities');

      expect(res.status).toBe(401);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('unauthorized');
    });

    it('POST /v1/feedback without auth returns 401', async () => {
      const app = makeApp();
      const res = await postJson(app, '/v1/feedback', {
        factId: '00000000-0000-0000-0000-000000000001',
        wasUseful: true,
        feedbackType: 'thumbs_up',
      });

      expect(res.status).toBe(401);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('unauthorized');
    });

    it('GET /v1/extractions without auth returns 401', async () => {
      const app = makeApp();
      const res = await app.request('/v1/extractions');

      expect(res.status).toBe(401);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('unauthorized');
    });

    it('GET /v1/webhooks without auth returns 401', async () => {
      const app = makeApp();
      const res = await app.request('/v1/webhooks');

      expect(res.status).toBe(401);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('unauthorized');
    });

    it('GET /v1/usage without auth returns 401', async () => {
      const app = makeApp();
      const res = await app.request('/v1/usage');

      expect(res.status).toBe(401);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('unauthorized');
    });

    it('GET /v1/keys without auth returns 401', async () => {
      const app = makeApp();
      const res = await app.request('/v1/keys');

      expect(res.status).toBe(401);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('unauthorized');
    });
  });

  describe('X-Request-Id on all responses', () => {
    it('health response has X-Request-Id', async () => {
      const app = makeApp();
      const res = await app.request('/health');
      expect(res.headers.get('X-Request-Id')).toBeTruthy();
    });

    it('401 response has X-Request-Id', async () => {
      const app = makeApp();
      const res = await app.request('/v1/memory?scope=user&scope_id=u1');
      expect(res.status).toBe(401);
      expect(res.headers.get('X-Request-Id')).toBeTruthy();
    });
  });

  describe('CORS preflight', () => {
    it('OPTIONS request returns CORS headers', async () => {
      const app = makeApp();
      const res = await app.request('/v1/memory/search', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://example.com',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Authorization,Content-Type',
        },
      });

      // Hono CORS middleware responds to preflight with 204
      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });
  });
});

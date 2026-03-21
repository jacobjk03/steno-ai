import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { hashApiKey } from '@steno-ai/engine';
import type { StorageAdapter } from '@steno-ai/engine';
import type { AppVariables } from '../../src/app.js';
import type { Env } from '../../src/env.js';
import type { Adapters } from '../../src/lib/adapters.js';
import { requestIdMiddleware } from '../../src/middleware/request-id.js';
import { usage } from '../../src/routes/usage.js';

// ---------- constants ----------

const TEST_KEY = 'sk_steno_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh';
const TEST_PREFIX = 'sk_steno_ABCD';
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const API_KEY_ID = '00000000-0000-0000-0000-000000000099';

let keyHash: string;

// ---------- helpers ----------

function makeStorage(overrides: Partial<StorageAdapter> = {}): StorageAdapter {
  const noop = vi.fn().mockResolvedValue(undefined);
  const noopNull = vi.fn().mockResolvedValue(null);
  const noopList = vi.fn().mockResolvedValue([]);
  const noopPaged = vi.fn().mockResolvedValue({ data: [], cursor: null, hasMore: false });
  const noopBool = vi.fn().mockResolvedValue(true);

  return {
    createFact: noop, getFact: noopNull, getFactsByIds: noopList,
    getFactsByLineage: noopList, getFactsByScope: noopPaged, invalidateFact: noop,
    purgeFacts: vi.fn().mockResolvedValue(0), updateDecayScores: noop,
    vectorSearch: noopList, keywordSearch: noopList,
    createEntity: noop, getEntity: noopNull, findEntityByCanonicalName: noopNull,
    getEntitiesForTenant: noopPaged,
    linkFactEntity: noop, getEntitiesForFact: noopList, getFactsForEntity: noopPaged,
    createEdge: noop, getEdgesForEntity: noopList,
    graphTraversal: vi.fn().mockResolvedValue({ entities: [], edges: [] }),
    createTrigger: noop, getTrigger: noopNull, getActiveTriggers: noopList,
    updateTrigger: noop, deleteTrigger: noop, incrementTriggerFired: noop,
    createMemoryAccess: noop, updateFeedback: noop,
    createExtraction: noop, getExtraction: noopNull, updateExtraction: noop,
    getExtractionByHash: noopNull, getExtractionsByTenant: noopPaged,
    createSession: noop, getSession: noopNull, endSession: noop,
    getSessionsByScope: noopPaged,
    createTenant: noop,
    getTenant: vi.fn().mockResolvedValue({
      id: TENANT_ID, name: 'Test Tenant', slug: 'test-tenant', config: {},
      plan: 'pro', tokenLimitMonthly: 100_000, queryLimitMonthly: 10_000,
      stripeCustomerId: null, stripeSubscriptionId: null,
      active: true, createdAt: new Date(), updatedAt: new Date(),
    }),
    getTenantBySlug: noopNull, updateTenant: noop,
    createApiKey: noop,
    getApiKeyByPrefix: vi.fn().mockImplementation(async () => ({
      id: API_KEY_ID, tenantId: TENANT_ID, keyHash, keyPrefix: TEST_PREFIX,
      name: 'Test Key', scopes: ['read', 'write', 'admin'],
      expiresAt: null, lastUsedAt: null, active: true, createdAt: new Date(),
    })),
    getApiKeysForTenant: noopList, revokeApiKey: noop, updateApiKeyLastUsed: noop,
    incrementUsage: noop, getUsage: noopNull,
    getCurrentUsage: vi.fn().mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000060',
      tenantId: TENANT_ID,
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-03-31'),
      tokensUsed: 5000,
      queriesUsed: 120,
      extractionsCount: 15,
      costUsd: 1.25,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    createWebhook: noop, getWebhook: noopNull, getWebhooksForTenant: noopList,
    getWebhooksByEvent: noopList, deleteWebhook: noop,
    ping: noopBool,
    ...overrides,
  } as StorageAdapter;
}

function buildApp(storage: StorageAdapter) {
  const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  // Inject mock adapters BEFORE routes (so authMiddleware can find them)
  app.use('*', async (c, next) => {
    const adapters = { storage } as unknown as Adapters;
    c.set('adapters' as never, adapters);
    await next();
  });

  app.use('*', requestIdMiddleware());
  app.route('/v1/usage', usage);

  return app;
}

// ---------- tests ----------

describe('usage routes', () => {
  beforeEach(async () => {
    keyHash = await hashApiKey(TEST_KEY);
  });

  describe('GET /v1/usage', () => {
    it('returns 200 with usage data', async () => {
      const storage = makeStorage();
      const app = buildApp(storage);

      const res = await app.request('/v1/usage', {
        headers: { Authorization: `Bearer ${TEST_KEY}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.tokens_used).toBe(5000);
      expect(body.data.queries_used).toBe(120);
      expect(body.data.extractions_count).toBe(15);
      expect(body.data.cost_usd).toBe(1.25);
    });

    it('returns zeroed stats when no usage record exists', async () => {
      const storage = makeStorage({
        getCurrentUsage: vi.fn().mockResolvedValue(null),
      });
      const app = buildApp(storage);

      const res = await app.request('/v1/usage', {
        headers: { Authorization: `Bearer ${TEST_KEY}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.tokens_used).toBe(0);
      expect(body.data.queries_used).toBe(0);
      expect(body.data.extractions_count).toBe(0);
      expect(body.data.cost_usd).toBe(0);
    });
  });
});

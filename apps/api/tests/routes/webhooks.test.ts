import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { hashApiKey } from '@steno-ai/engine';
import type { StorageAdapter } from '@steno-ai/engine';
import type { AppVariables } from '../../src/app.js';
import type { Env } from '../../src/env.js';
import type { Adapters } from '../../src/lib/adapters.js';
import { requestIdMiddleware } from '../../src/middleware/request-id.js';
import { webhooks } from '../../src/routes/webhooks.js';

// ---------- constants ----------

const TEST_KEY = 'sk_steno_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh';
const TEST_PREFIX = 'sk_steno_ABCD';
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const API_KEY_ID = '00000000-0000-0000-0000-000000000099';
const WEBHOOK_ID = '00000000-0000-0000-0000-000000000050';

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
    incrementUsage: noop, getUsage: noopNull, getCurrentUsage: noopNull,
    createWebhook: vi.fn().mockImplementation(async (input) => ({
      id: input.id, tenantId: TENANT_ID, url: input.url,
      events: input.events, secretHash: input.secretHash,
      active: true, createdAt: new Date(),
    })),
    getWebhook: vi.fn().mockImplementation(async () => ({
      id: WEBHOOK_ID, tenantId: TENANT_ID, url: 'https://example.com/hook',
      events: ['extraction.completed'], secretHash: 'abc',
      active: true, createdAt: new Date(),
    })),
    getWebhooksForTenant: vi.fn().mockResolvedValue([
      {
        id: WEBHOOK_ID, tenantId: TENANT_ID, url: 'https://example.com/hook',
        events: ['extraction.completed'], secretHash: 'abc',
        active: true, createdAt: new Date(),
      },
    ]),
    getWebhooksByEvent: noopList,
    deleteWebhook: noop,
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
  app.route('/v1/webhooks', webhooks);

  return app;
}

// ---------- tests ----------

describe('webhook routes', () => {
  beforeEach(async () => {
    keyHash = await hashApiKey(TEST_KEY);
  });

  describe('POST /v1/webhooks', () => {
    it('returns 201 with webhook (secret NOT returned)', async () => {
      const storage = makeStorage();
      const app = buildApp(storage);

      const res = await app.request('/v1/webhooks', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TEST_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: 'https://example.com/webhook',
          events: ['extraction.completed'],
          secret: 'super-secret-key-1234',
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.url).toBe('https://example.com/webhook');
      expect(body.data.events).toEqual(['extraction.completed']);
      expect(body.data.id).toBeDefined();
      // Secret must NOT be returned
      expect(body.data.secret).toBeUndefined();
      expect(body.data.secret_hash).toBeUndefined();
    });
  });

  describe('GET /v1/webhooks', () => {
    it('returns 200 with list of webhooks', async () => {
      const storage = makeStorage();
      const app = buildApp(storage);

      const res = await app.request('/v1/webhooks', {
        headers: { Authorization: `Bearer ${TEST_KEY}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(1);
      expect(body.data[0].url).toBe('https://example.com/hook');
      // Secret hash must NOT be exposed
      expect(body.data[0].secret_hash).toBeUndefined();
    });
  });

  describe('DELETE /v1/webhooks/:id', () => {
    it('returns 200 on successful delete', async () => {
      const storage = makeStorage();
      const app = buildApp(storage);

      const res = await app.request(`/v1/webhooks/${WEBHOOK_ID}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${TEST_KEY}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(WEBHOOK_ID);
      expect(body.data.deleted).toBe(true);
    });

    it('returns 404 when webhook does not exist', async () => {
      const storage = makeStorage({
        getWebhook: vi.fn().mockResolvedValue(null),
      });
      const app = buildApp(storage);

      const res = await app.request('/v1/webhooks/nonexistent-id', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${TEST_KEY}` },
      });

      expect(res.status).toBe(404);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { hashApiKey } from '@steno-ai/engine';
import type { StorageAdapter } from '@steno-ai/engine';
import type { AppVariables } from '../../src/app.js';
import type { Env } from '../../src/env.js';
import type { Adapters } from '../../src/lib/adapters.js';
import { requestIdMiddleware } from '../../src/middleware/request-id.js';
import { keys } from '../../src/routes/keys.js';

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
    createApiKey: vi.fn().mockImplementation(async (input) => ({
      id: input.id, tenantId: TENANT_ID, keyHash: input.keyHash,
      keyPrefix: input.keyPrefix, name: input.name,
      scopes: input.scopes, expiresAt: input.expiresAt ?? null,
      lastUsedAt: null, active: true, createdAt: new Date(),
    })),
    getApiKeyByPrefix: vi.fn().mockImplementation(async () => ({
      id: API_KEY_ID, tenantId: TENANT_ID, keyHash, keyPrefix: TEST_PREFIX,
      name: 'Test Key', scopes: ['read', 'write', 'admin'],
      expiresAt: null, lastUsedAt: null, active: true, createdAt: new Date(),
    })),
    getApiKeysForTenant: vi.fn().mockResolvedValue([
      {
        id: API_KEY_ID, tenantId: TENANT_ID, keyHash: 'hashed',
        keyPrefix: TEST_PREFIX, name: 'Test Key',
        scopes: ['read', 'write', 'admin'], expiresAt: null,
        lastUsedAt: null, active: true, createdAt: new Date(),
      },
    ]),
    revokeApiKey: noop, updateApiKeyLastUsed: noop,
    incrementUsage: noop, getUsage: noopNull, getCurrentUsage: noopNull,
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
  app.route('/v1/keys', keys);

  return app;
}

// ---------- tests ----------

describe('keys routes', () => {
  beforeEach(async () => {
    keyHash = await hashApiKey(TEST_KEY);
  });

  describe('POST /v1/keys', () => {
    it('returns 201 with full key (starts with sk_steno_)', async () => {
      const storage = makeStorage();
      const app = buildApp(storage);

      const res = await app.request('/v1/keys', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TEST_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'My New Key', scopes: ['read'] }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.key).toBeDefined();
      expect(body.data.key.startsWith('sk_steno_')).toBe(true);
      expect(body.data.name).toBe('My New Key');
      expect(body.data.scopes).toEqual(['read']);
      expect(body.data.id).toBeDefined();
      // Hash must NOT be returned
      expect(body.data.key_hash).toBeUndefined();
    });
  });

  describe('GET /v1/keys', () => {
    it('returns 200 with array (prefix shown, NOT hash)', async () => {
      const storage = makeStorage();
      const app = buildApp(storage);

      const res = await app.request('/v1/keys', {
        headers: { Authorization: `Bearer ${TEST_KEY}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(1);
      expect(body.data[0].key_prefix).toBe(TEST_PREFIX);
      expect(body.data[0].name).toBe('Test Key');
      expect(body.data[0].scopes).toEqual(['read', 'write', 'admin']);
      // Hash must NOT be exposed
      expect(body.data[0].key_hash).toBeUndefined();
    });
  });

  describe('DELETE /v1/keys/:id', () => {
    it('returns 200 on successful revocation', async () => {
      const storage = makeStorage();
      const app = buildApp(storage);

      const res = await app.request(`/v1/keys/${API_KEY_ID}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${TEST_KEY}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(API_KEY_ID);
      expect(body.data.revoked).toBe(true);
    });
  });
});

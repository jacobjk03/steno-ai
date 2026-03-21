import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { hashApiKey } from '@steno-ai/engine';
import type { StorageAdapter } from '@steno-ai/engine';
import type { AppVariables } from '../../src/app.js';
import type { Env } from '../../src/env.js';
import { requestIdMiddleware } from '../../src/middleware/request-id.js';
import { authMiddleware } from '../../src/middleware/auth.js';
import type { Adapters } from '../../src/lib/adapters.js';

// ---------- helpers ----------

const TEST_KEY = 'sk_steno_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh';
const TEST_PREFIX = 'sk_steno_ABCD';
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const API_KEY_ID = '00000000-0000-0000-0000-000000000099';

let keyHash: string;

function makeStorage(overrides: Partial<StorageAdapter> = {}): StorageAdapter {
  const noop = vi.fn().mockResolvedValue(undefined);
  const noopNull = vi.fn().mockResolvedValue(null);
  const noopList = vi.fn().mockResolvedValue([]);
  const noopPaged = vi.fn().mockResolvedValue({ data: [], cursor: null, hasMore: false });
  const noopBool = vi.fn().mockResolvedValue(true);

  return {
    // Facts
    createFact: noop,
    getFact: noopNull,
    getFactsByIds: noopList,
    getFactsByLineage: noopList,
    getFactsByScope: noopPaged,
    invalidateFact: noop,
    purgeFacts: vi.fn().mockResolvedValue(0),
    updateDecayScores: noop,

    // Vector / keyword search
    vectorSearch: noopList,
    keywordSearch: noopList,

    // Entities
    createEntity: noop,
    getEntity: noopNull,
    findEntityByCanonicalName: noopNull,
    getEntitiesForTenant: noopPaged,

    // Fact-Entity junction
    linkFactEntity: noop,
    getEntitiesForFact: noopList,
    getFactsForEntity: noopPaged,

    // Edges
    createEdge: noop,
    getEdgesForEntity: noopList,
    graphTraversal: vi.fn().mockResolvedValue({ entities: [], edges: [] }),

    // Triggers
    createTrigger: noop,
    getTrigger: noopNull,
    getActiveTriggers: noopList,
    updateTrigger: noop,
    deleteTrigger: noop,
    incrementTriggerFired: noop,

    // Memory access
    createMemoryAccess: noop,
    updateFeedback: noop,

    // Extractions
    createExtraction: noop,
    getExtraction: noopNull,
    updateExtraction: noop,
    getExtractionByHash: noopNull,
    getExtractionsByTenant: noopPaged,

    // Sessions
    createSession: noop,
    getSession: noopNull,
    endSession: noop,
    getSessionsByScope: noopPaged,

    // Tenants
    createTenant: noop,
    getTenant: vi.fn().mockResolvedValue({
      id: TENANT_ID,
      name: 'Test Tenant',
      slug: 'test-tenant',
      config: {},
      plan: 'pro',
      tokenLimitMonthly: 100_000,
      queryLimitMonthly: 10_000,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    getTenantBySlug: noopNull,
    updateTenant: noop,

    // API Keys
    createApiKey: noop,
    getApiKeyByPrefix: vi.fn().mockImplementation(async () => ({
      id: API_KEY_ID,
      tenantId: TENANT_ID,
      keyHash,
      keyPrefix: TEST_PREFIX,
      name: 'Test Key',
      scopes: ['read', 'write'],
      expiresAt: null,
      lastUsedAt: null,
      active: true,
      createdAt: new Date(),
    })),
    getApiKeysForTenant: noopList,
    revokeApiKey: noop,
    updateApiKeyLastUsed: noop,

    // Usage
    incrementUsage: noop,
    getUsage: noopNull,
    getCurrentUsage: noopNull,

    // Webhooks
    createWebhook: noop,
    getWebhook: noopNull,
    getWebhooksForTenant: noopList,
    getWebhooksByEvent: noopList,
    deleteWebhook: noop,

    // Health
    ping: noopBool,

    ...overrides,
  } as StorageAdapter;
}

type HonoApp = Hono<{ Bindings: Env; Variables: AppVariables }>;

function buildApp(storage: StorageAdapter, requiredScope?: string): HonoApp {
  const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  // Inject mock adapters before auth middleware runs
  app.use('*', async (c, next) => {
    const adapters = { storage } as unknown as Adapters;
    c.set('adapters' as never, adapters);
    await next();
  });

  app.use('*', requestIdMiddleware());
  app.use('*', authMiddleware(requiredScope));

  app.get('/test', (c) =>
    c.json({
      tenantId: c.get('tenantId'),
      tenantPlan: c.get('tenantPlan'),
      scopes: c.get('apiKeyScopes'),
    }),
  );

  return app;
}

// ---------- tests ----------

describe('auth middleware', () => {
  beforeEach(async () => {
    keyHash = await hashApiKey(TEST_KEY);
  });

  it('returns 200 and sets tenant context for a valid key', async () => {
    const storage = makeStorage();
    const app = buildApp(storage, 'read');

    const res = await app.request('/test', {
      headers: { Authorization: `Bearer ${TEST_KEY}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenantId).toBe(TENANT_ID);
    expect(body.tenantPlan).toBe('pro');
    expect(body.scopes).toEqual(['read', 'write']);
  });

  it('returns 401 when Authorization header is missing', async () => {
    const app = buildApp(makeStorage(), 'read');

    const res = await app.request('/test');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('unauthorized');
    expect(body.error.message).toContain('Missing or invalid Authorization header');
  });

  it('returns 401 when Authorization header is not Bearer', async () => {
    const app = buildApp(makeStorage(), 'read');

    const res = await app.request('/test', {
      headers: { Authorization: 'Basic abc123' },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('unauthorized');
    expect(body.error.message).toContain('Missing or invalid Authorization header');
  });

  it('returns 401 when prefix does not match any key', async () => {
    const storage = makeStorage({
      getApiKeyByPrefix: vi.fn().mockResolvedValue(null),
    });
    const app = buildApp(storage, 'read');

    const res = await app.request('/test', {
      headers: { Authorization: `Bearer ${TEST_KEY}` },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('unauthorized');
    expect(body.error.message).toBe('Invalid API key');
  });

  it('returns 401 when prefix matches but bcrypt verification fails', async () => {
    const wrongHash = await hashApiKey('sk_steno_WRONG_KEY_THAT_DOES_NOT_MATCH_000');
    const storage = makeStorage({
      getApiKeyByPrefix: vi.fn().mockResolvedValue({
        id: API_KEY_ID,
        tenantId: TENANT_ID,
        keyHash: wrongHash,
        keyPrefix: TEST_PREFIX,
        name: 'Test Key',
        scopes: ['read', 'write'],
        expiresAt: null,
        lastUsedAt: null,
        active: true,
        createdAt: new Date(),
      }),
    });
    const app = buildApp(storage, 'read');

    const res = await app.request('/test', {
      headers: { Authorization: `Bearer ${TEST_KEY}` },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('unauthorized');
    expect(body.error.message).toBe('Invalid API key');
  });

  it('returns 401 when key has expired', async () => {
    const storage = makeStorage({
      getApiKeyByPrefix: vi.fn().mockResolvedValue({
        id: API_KEY_ID,
        tenantId: TENANT_ID,
        keyHash,
        keyPrefix: TEST_PREFIX,
        name: 'Test Key',
        scopes: ['read', 'write'],
        expiresAt: new Date('2020-01-01'),
        lastUsedAt: null,
        active: true,
        createdAt: new Date(),
      }),
    });
    const app = buildApp(storage, 'read');

    const res = await app.request('/test', {
      headers: { Authorization: `Bearer ${TEST_KEY}` },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toBe('API key has expired');
  });

  it('returns 401 when key has been revoked (inactive)', async () => {
    const storage = makeStorage({
      getApiKeyByPrefix: vi.fn().mockResolvedValue({
        id: API_KEY_ID,
        tenantId: TENANT_ID,
        keyHash,
        keyPrefix: TEST_PREFIX,
        name: 'Test Key',
        scopes: ['read', 'write'],
        expiresAt: null,
        lastUsedAt: null,
        active: false,
        createdAt: new Date(),
      }),
    });
    const app = buildApp(storage, 'read');

    const res = await app.request('/test', {
      headers: { Authorization: `Bearer ${TEST_KEY}` },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toBe('API key has been revoked');
  });

  it('returns 403 when key lacks the required scope', async () => {
    const storage = makeStorage({
      getApiKeyByPrefix: vi.fn().mockResolvedValue({
        id: API_KEY_ID,
        tenantId: TENANT_ID,
        keyHash,
        keyPrefix: TEST_PREFIX,
        name: 'Test Key',
        scopes: ['read'],
        expiresAt: null,
        lastUsedAt: null,
        active: true,
        createdAt: new Date(),
      }),
    });
    const app = buildApp(storage, 'admin');

    const res = await app.request('/test', {
      headers: { Authorization: `Bearer ${TEST_KEY}` },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('forbidden');
    expect(body.error.message).toContain('admin');
  });

  it('returns 401 when tenant is inactive', async () => {
    const storage = makeStorage({
      getTenant: vi.fn().mockResolvedValue({
        id: TENANT_ID,
        name: 'Inactive Tenant',
        slug: 'inactive',
        config: {},
        plan: 'free',
        tokenLimitMonthly: 1000,
        queryLimitMonthly: 100,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        active: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    });
    const app = buildApp(storage, 'read');

    const res = await app.request('/test', {
      headers: { Authorization: `Bearer ${TEST_KEY}` },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toBe('Tenant not found or inactive');
  });

  it('returns 401 when tenant is not found', async () => {
    const storage = makeStorage({
      getTenant: vi.fn().mockResolvedValue(null),
    });
    const app = buildApp(storage, 'read');

    const res = await app.request('/test', {
      headers: { Authorization: `Bearer ${TEST_KEY}` },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toBe('Tenant not found or inactive');
  });

  it('includes X-Request-Id on all responses', async () => {
    const app = buildApp(makeStorage(), 'read');

    // Success response
    const successRes = await app.request('/test', {
      headers: { Authorization: `Bearer ${TEST_KEY}` },
    });
    const successRequestId = successRes.headers.get('X-Request-Id');
    expect(successRequestId).toBeTruthy();
    expect(successRequestId).toMatch(/^req_[a-f0-9]{16}$/);

    // Error response
    const errorRes = await app.request('/test');
    const errorRequestId = errorRes.headers.get('X-Request-Id');
    expect(errorRequestId).toBeTruthy();
    expect(errorRequestId).toMatch(/^req_[a-f0-9]{16}$/);

    // Request IDs should be different
    expect(successRequestId).not.toBe(errorRequestId);
  });

  it('includes request_id in error response body', async () => {
    const app = buildApp(makeStorage(), 'read');

    const res = await app.request('/test');
    const body = await res.json();
    const headerRequestId = res.headers.get('X-Request-Id');

    expect(body.error.request_id).toBe(headerRequestId);
  });

  it('fires updateApiKeyLastUsed after successful auth', async () => {
    const storage = makeStorage();
    const app = buildApp(storage, 'read');

    await app.request('/test', {
      headers: { Authorization: `Bearer ${TEST_KEY}` },
    });

    // Allow fire-and-forget promise to settle
    await new Promise((r) => setTimeout(r, 10));

    expect(storage.updateApiKeyLastUsed).toHaveBeenCalledWith(API_KEY_ID);
  });

  it('allows access when no requiredScope is specified', async () => {
    const storage = makeStorage({
      getApiKeyByPrefix: vi.fn().mockResolvedValue({
        id: API_KEY_ID,
        tenantId: TENANT_ID,
        keyHash,
        keyPrefix: TEST_PREFIX,
        name: 'Test Key',
        scopes: [],
        expiresAt: null,
        lastUsedAt: null,
        active: true,
        createdAt: new Date(),
      }),
    });
    const app = buildApp(storage); // no requiredScope

    const res = await app.request('/test', {
      headers: { Authorization: `Bearer ${TEST_KEY}` },
    });
    expect(res.status).toBe(200);
  });
});

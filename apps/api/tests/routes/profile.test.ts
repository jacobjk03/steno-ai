import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { StorageAdapter } from '@steno-ai/engine';
import type { AppVariables } from '../../src/app.js';
import type { Env } from '../../src/env.js';
import type { Adapters } from '../../src/lib/adapters.js';
import { globalErrorHandler } from '../../src/middleware/error-handler.js';

// Mock auth middleware to bypass authentication in route tests
vi.mock('../../src/middleware/auth.js', () => ({
  authMiddleware: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

// Mock getUserProfile from engine
const { mockGetUserProfile } = vi.hoisted(() => ({
  mockGetUserProfile: vi.fn(),
}));
vi.mock('@steno-ai/engine', async () => {
  const actual = await vi.importActual<typeof import('@steno-ai/engine')>('@steno-ai/engine');
  return { ...actual, getUserProfile: mockGetUserProfile };
});

import { profile } from '../../src/routes/profile.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

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
    createTenant: noop, getTenant: noopNull, getTenantBySlug: noopNull, updateTenant: noop,
    createApiKey: noop, getApiKeyByPrefix: noopNull, getApiKeysForTenant: noopList,
    revokeApiKey: noop, updateApiKeyLastUsed: noop,
    incrementUsage: noop, getUsage: noopNull, getCurrentUsage: noopNull,
    createWebhook: noop, getWebhook: noopNull, getWebhooksForTenant: noopList,
    getWebhooksByEvent: noopList, deleteWebhook: noop, ping: noopBool,
    ...overrides,
  } as StorageAdapter;
}

function createTestApp(storageOverrides: Partial<StorageAdapter> = {}) {
  const storage = makeStorage(storageOverrides);
  const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  app.onError(globalErrorHandler);

  app.use('*', async (c, next) => {
    c.set('requestId', 'req_test_000000000000');
    c.set('tenantId', TENANT_ID);
    c.set('tenantPlan', 'pro');
    c.set('apiKeyScopes', ['read', 'write', 'admin']);
    const adapters = { storage } as unknown as Adapters;
    c.set('adapters', adapters);
    await next();
  });

  app.route('/v1/profile', profile);
  return { app, storage };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /v1/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns user profile with static and dynamic facts', async () => {
    const now = new Date();
    const profileData = {
      userId: 'user_123',
      static: [
        { id: 'f1', content: 'Name is Alice', importance: 0.9, category: 'identity', validFrom: now },
      ],
      dynamic: [
        { id: 'f2', content: 'Working on Steno project', importance: 0.5, category: 'work', validFrom: now },
      ],
      lastUpdated: now,
    };

    mockGetUserProfile.mockResolvedValue(profileData);

    const { app } = createTestApp();
    const res = await app.request('/v1/profile?scope=user&scope_id=user_123');
    expect(res.status).toBe(200);

    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toBeDefined();
    expect(json.data.user_id).toBe('user_123');
    expect(json.data.static).toHaveLength(1);
    expect(json.data.dynamic).toHaveLength(1);

    expect(mockGetUserProfile).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      'user_123',
    );
  });

  it('returns 400 when scope is missing', async () => {
    const { app } = createTestApp();
    const res = await app.request('/v1/profile?scope_id=user_123');
    expect(res.status).toBe(400);

    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('bad_request');
  });

  it('returns 400 when scope_id is missing', async () => {
    const { app } = createTestApp();
    const res = await app.request('/v1/profile?scope=user');
    expect(res.status).toBe(400);

    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('bad_request');
  });

  it('returns 400 when both scope and scope_id are missing', async () => {
    const { app } = createTestApp();
    const res = await app.request('/v1/profile');
    expect(res.status).toBe(400);

    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('bad_request');
  });
});

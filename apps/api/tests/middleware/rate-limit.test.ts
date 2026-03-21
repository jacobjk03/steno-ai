import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { AppVariables } from '../../src/app.js';
import type { Env } from '../../src/env.js';
import { PLAN_LIMITS } from '../../src/middleware/rate-limit.js';

// Mock @upstash/ratelimit before importing the middleware
const mockLimit = vi.fn();

vi.mock('@upstash/ratelimit', () => {
  return {
    Ratelimit: class MockRatelimit {
      limit = mockLimit;
      static slidingWindow(requests: number, window: string) {
        return { type: 'slidingWindow', requests, window };
      }
    },
  };
});

vi.mock('@upstash/redis', () => {
  return {
    Redis: class MockRedis {
      constructor(_opts: { url: string; token: string }) {}
    },
  };
});

// Import after mocks are set up
const { rateLimitMiddleware } = await import('../../src/middleware/rate-limit.js');

// ---------- helpers ----------

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const REQUEST_ID = 'req_abc123def456gh';

type HonoApp = Hono<{ Bindings: Env; Variables: AppVariables }>;

function buildApp(opts: { plan?: string } = {}): HonoApp {
  const { plan = 'pro' } = opts;
  const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  // Set up context variables that auth middleware would normally provide
  app.use('*', async (c, next) => {
    c.set('requestId', REQUEST_ID);
    c.set('tenantId', TENANT_ID);
    c.set('tenantPlan', plan);
    await next();
  });

  app.use('*', rateLimitMiddleware());

  app.get('/test', (c) => c.json({ ok: true }));

  return app;
}

const REDIS_ENV = {
  UPSTASH_REDIS_REST_URL: 'https://fake-redis.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'fake-token',
} as unknown as Env;

// ---------- tests ----------

describe('rate limit middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('PLAN_LIMITS configuration', () => {
    it('has correct limits for free plan', () => {
      expect(PLAN_LIMITS['free']).toEqual({ requests: 30, window: '1 m' });
    });

    it('has correct limits for pro plan', () => {
      expect(PLAN_LIMITS['pro']).toEqual({ requests: 120, window: '1 m' });
    });

    it('has correct limits for scale plan', () => {
      expect(PLAN_LIMITS['scale']).toEqual({ requests: 600, window: '1 m' });
    });

    it('has correct limits for enterprise plan', () => {
      expect(PLAN_LIMITS['enterprise']).toEqual({ requests: 6000, window: '1 m' });
    });

    it('has increasing limits from free to enterprise', () => {
      const free = PLAN_LIMITS['free']!.requests;
      const pro = PLAN_LIMITS['pro']!.requests;
      const scale = PLAN_LIMITS['scale']!.requests;
      const enterprise = PLAN_LIMITS['enterprise']!.requests;

      expect(free).toBeLessThan(pro);
      expect(pro).toBeLessThan(scale);
      expect(scale).toBeLessThan(enterprise);
    });
  });

  describe('no Redis configured (local dev)', () => {
    it('passes through without rate limiting when UPSTASH_REDIS_REST_URL is missing', async () => {
      const app = buildApp();

      // No env bindings passed — c.env is undefined
      const res = await app.request('/test');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);

      // Should not have called ratelimit.limit
      expect(mockLimit).not.toHaveBeenCalled();

      // Should not set rate limit headers
      expect(res.headers.get('X-RateLimit-Limit')).toBeNull();
      expect(res.headers.get('X-RateLimit-Remaining')).toBeNull();
      expect(res.headers.get('X-RateLimit-Reset')).toBeNull();
    });

    it('passes through when env exists but UPSTASH_REDIS_REST_URL is empty', async () => {
      const app = buildApp();

      const res = await app.request('/test', undefined, {
        UPSTASH_REDIS_REST_URL: '',
        UPSTASH_REDIS_REST_TOKEN: '',
      } as unknown as Env);

      expect(res.status).toBe(200);
      expect(mockLimit).not.toHaveBeenCalled();
    });
  });

  describe('with Redis configured', () => {
    it('allows request when under rate limit', async () => {
      const resetTime = Date.now() + 60_000;
      mockLimit.mockResolvedValue({
        success: true,
        limit: 120,
        remaining: 119,
        reset: resetTime,
      });

      const app = buildApp({ plan: 'pro' });
      const res = await app.request('/test', undefined, REDIS_ENV);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);

      // Should call limit with tenantId
      expect(mockLimit).toHaveBeenCalledWith(TENANT_ID);
    });

    it('sets rate limit headers on successful response', async () => {
      const resetTime = Date.now() + 60_000;
      mockLimit.mockResolvedValue({
        success: true,
        limit: 120,
        remaining: 99,
        reset: resetTime,
      });

      const app = buildApp({ plan: 'pro' });
      const res = await app.request('/test', undefined, REDIS_ENV);

      expect(res.headers.get('X-RateLimit-Limit')).toBe('120');
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('99');
      expect(res.headers.get('X-RateLimit-Reset')).toBe(String(resetTime));
    });

    it('returns 429 when rate limit exceeded', async () => {
      const resetTime = Date.now() + 30_000;
      mockLimit.mockResolvedValue({
        success: false,
        limit: 120,
        remaining: 0,
        reset: resetTime,
      });

      const app = buildApp({ plan: 'pro' });
      const res = await app.request('/test', undefined, REDIS_ENV);

      expect(res.status).toBe(429);
    });

    it('returns correct error format on 429', async () => {
      const resetTime = Date.now() + 30_000;
      mockLimit.mockResolvedValue({
        success: false,
        limit: 120,
        remaining: 0,
        reset: resetTime,
      });

      const app = buildApp({ plan: 'pro' });
      const res = await app.request('/test', undefined, REDIS_ENV);
      const body = await res.json();

      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('rate_limit_exceeded');
      expect(body.error.message).toBe('Rate limit of 120 requests per minute exceeded');
      expect(body.error.status).toBe(429);
      expect(body.error.retry_after).toBeTypeOf('number');
      expect(body.error.retry_after).toBeGreaterThan(0);
      expect(body.error.request_id).toBe(REQUEST_ID);
    });

    it('sets rate limit headers on 429 response', async () => {
      const resetTime = Date.now() + 30_000;
      mockLimit.mockResolvedValue({
        success: false,
        limit: 120,
        remaining: 0,
        reset: resetTime,
      });

      const app = buildApp({ plan: 'pro' });
      const res = await app.request('/test', undefined, REDIS_ENV);

      expect(res.headers.get('X-RateLimit-Limit')).toBe('120');
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
      expect(res.headers.get('X-RateLimit-Reset')).toBe(String(resetTime));
    });

    it('uses free plan limits for unknown plans', async () => {
      const resetTime = Date.now() + 60_000;
      mockLimit.mockResolvedValue({
        success: false,
        limit: 30,
        remaining: 0,
        reset: resetTime,
      });

      const app = buildApp({ plan: 'unknown_plan' });
      const res = await app.request('/test', undefined, REDIS_ENV);
      const body = await res.json();

      expect(res.status).toBe(429);
      // Should use free plan limit (30) for unknown plans
      expect(body.error.message).toBe('Rate limit of 30 requests per minute exceeded');
    });

    it('uses correct limits for free plan', async () => {
      const resetTime = Date.now() + 60_000;
      mockLimit.mockResolvedValue({
        success: false,
        limit: 30,
        remaining: 0,
        reset: resetTime,
      });

      const app = buildApp({ plan: 'free' });
      const res = await app.request('/test', undefined, REDIS_ENV);
      const body = await res.json();

      expect(body.error.message).toBe('Rate limit of 30 requests per minute exceeded');
    });

    it('uses correct limits for scale plan', async () => {
      const resetTime = Date.now() + 60_000;
      mockLimit.mockResolvedValue({
        success: false,
        limit: 600,
        remaining: 0,
        reset: resetTime,
      });

      const app = buildApp({ plan: 'scale' });
      const res = await app.request('/test', undefined, REDIS_ENV);
      const body = await res.json();

      expect(body.error.message).toBe('Rate limit of 600 requests per minute exceeded');
    });

    it('uses correct limits for enterprise plan', async () => {
      const resetTime = Date.now() + 60_000;
      mockLimit.mockResolvedValue({
        success: false,
        limit: 6000,
        remaining: 0,
        reset: resetTime,
      });

      const app = buildApp({ plan: 'enterprise' });
      const res = await app.request('/test', undefined, REDIS_ENV);
      const body = await res.json();

      expect(body.error.message).toBe('Rate limit of 6000 requests per minute exceeded');
    });

    it('calculates retry_after correctly', async () => {
      const now = Date.now();
      const resetTime = now + 45_000; // 45 seconds from now
      mockLimit.mockResolvedValue({
        success: false,
        limit: 120,
        remaining: 0,
        reset: resetTime,
      });

      const app = buildApp({ plan: 'pro' });
      const res = await app.request('/test', undefined, REDIS_ENV);
      const body = await res.json();

      // retry_after should be roughly 45 seconds (allow some margin for test execution)
      expect(body.error.retry_after).toBeGreaterThanOrEqual(44);
      expect(body.error.retry_after).toBeLessThanOrEqual(46);
    });
  });
});

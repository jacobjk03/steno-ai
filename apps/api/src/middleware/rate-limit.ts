import type { MiddlewareHandler } from 'hono';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export const PLAN_LIMITS: Record<string, { requests: number; window: string }> = {
  free: { requests: 30, window: '1 m' },
  pro: { requests: 120, window: '1 m' },
  scale: { requests: 600, window: '1 m' },
  enterprise: { requests: 6000, window: '1 m' },
};

export function rateLimitMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const tenantId = c.get('tenantId');
    const plan = c.get('tenantPlan');

    // Skip rate limiting if Redis not configured (local dev)
    if (!c.env?.UPSTASH_REDIS_REST_URL) {
      await next();
      return;
    }

    const redis = new Redis({
      url: c.env.UPSTASH_REDIS_REST_URL,
      token: c.env.UPSTASH_REDIS_REST_TOKEN,
    });

    const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS['free']!;

    const ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(
        limits.requests,
        limits.window as `${number} ${'s' | 'm' | 'h' | 'd'}`,
      ),
      prefix: 'steno:ratelimit',
    });

    const { success, limit, remaining, reset } = await ratelimit.limit(tenantId);

    // Set rate limit headers on every response
    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(reset));

    if (!success) {
      const retryAfter = Math.ceil((reset - Date.now()) / 1000);
      return c.json(
        {
          error: {
            code: 'rate_limit_exceeded',
            message: `Rate limit of ${limits.requests} requests per minute exceeded`,
            status: 429,
            retry_after: retryAfter,
            request_id: c.get('requestId'),
          },
        },
        429,
      );
    }

    await next();
  };
}

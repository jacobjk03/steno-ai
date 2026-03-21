import type { MiddlewareHandler } from 'hono';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export const PLAN_LIMITS: Record<string, { requests: number; window: string }> = {
  free: { requests: 30, window: '1 m' },
  pro: { requests: 120, window: '1 m' },
  scale: { requests: 600, window: '1 m' },
  enterprise: { requests: 6000, window: '1 m' },
};

export const PLAN_LIMITS_DAILY: Record<string, { requests: number; window: string }> = {
  free: { requests: 5000, window: '1 d' },
  pro: { requests: 50000, window: '1 d' },
  scale: { requests: 500000, window: '1 d' },
  enterprise: { requests: 5000000, window: '1 d' },
};

export function rateLimitMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const tenantId = c.get('tenantId');
    const plan = c.get('tenantPlan');

    // Skip rate limiting if no tenantId set (pre-auth) or Redis not configured (local dev)
    if (!tenantId || !c.env?.UPSTASH_REDIS_REST_URL) {
      await next();
      return;
    }

    const redis = new Redis({
      url: c.env.UPSTASH_REDIS_REST_URL,
      token: c.env.UPSTASH_REDIS_REST_TOKEN,
    });

    const minuteLimits = PLAN_LIMITS[plan] ?? PLAN_LIMITS['free']!;
    const dailyLimits = PLAN_LIMITS_DAILY[plan] ?? PLAN_LIMITS_DAILY['free']!;

    const minuteRatelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(
        minuteLimits.requests,
        minuteLimits.window as `${number} ${'s' | 'm' | 'h' | 'd'}`,
      ),
      prefix: 'steno:ratelimit:minute',
    });

    const dailyRatelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(
        dailyLimits.requests,
        dailyLimits.window as `${number} ${'s' | 'm' | 'h' | 'd'}`,
      ),
      prefix: 'steno:ratelimit:daily',
    });

    // Check both limits in parallel
    const [minuteResult, dailyResult] = await Promise.all([
      minuteRatelimit.limit(tenantId),
      dailyRatelimit.limit(tenantId),
    ]);

    // Use the tighter (lower) remaining value and earliest reset
    const remaining = Math.min(minuteResult.remaining, dailyResult.remaining);
    const reset = Math.min(minuteResult.reset, dailyResult.reset);
    const limit = Math.min(minuteResult.limit, dailyResult.limit);

    // Set rate limit headers on every response
    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(reset));

    if (!minuteResult.success || !dailyResult.success) {
      const retryAfter = Math.ceil((reset - Date.now()) / 1000);
      const message = !minuteResult.success
        ? `Rate limit of ${minuteLimits.requests} requests per minute exceeded`
        : `Daily rate limit of ${dailyLimits.requests} requests per day exceeded`;
      return c.json(
        {
          error: {
            code: 'rate_limit_exceeded',
            message,
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

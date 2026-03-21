import type { MiddlewareHandler } from 'hono';

export function requestIdMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const id = `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    c.set('requestId', id);
    c.header('X-Request-Id', id);
    await next();
  };
}

import { Hono } from 'hono';
import type { Env } from './env.js';
import { requestIdMiddleware, corsMiddleware, globalErrorHandler, rateLimitMiddleware, authMiddleware } from './middleware/index.js';
import {
  memoryRoutes,
  exportRoutes,
  searchRoutes,
  sessions,
  entities,
  triggers,
  feedback,
  extractions,
  webhooks,
  usage,
  keys,
  profile,
} from './routes/index.js';

// Context variables set by middleware
export interface AppVariables {
  requestId: string;
  tenantId: string;
  tenantPlan: string;
  apiKeyScopes: string[];
  adapters: unknown;
  validatedBody: unknown;
}

export type AppType = Hono<{ Bindings: Env; Variables: AppVariables }>;

export function createApp(): AppType {
  const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  // 1. Request ID — first, available everywhere
  app.use('*', requestIdMiddleware());

  // 2. CORS
  app.use('*', corsMiddleware());

  // 3. Global error handler
  app.onError(globalErrorHandler);

  // 4. Health check — no auth required
  app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

  // 5. Global auth for /v1/* — resolves tenant identity (no scope check)
  //    Per-route authMiddleware('scope') then just checks scope (idempotent)
  app.use('/v1/*', authMiddleware());

  // 6. Rate limiting — runs AFTER auth so tenantId/tenantPlan are available
  app.use('/v1/*', rateLimitMiddleware());

  // 7. API v1 routes — per-route auth checks scope only (tenant already resolved)
  //    Mount /v1/memory/search BEFORE /v1/memory to avoid path conflicts
  app.route('/v1/memory/search', searchRoutes);
  app.route('/v1/memory', memoryRoutes);
  app.route('/v1/sessions', sessions);
  app.route('/v1/entities', entities);
  app.route('/v1/triggers', triggers);
  app.route('/v1/feedback', feedback);
  app.route('/v1/extractions', extractions);
  app.route('/v1/webhooks', webhooks);
  app.route('/v1/usage', usage);
  app.route('/v1/keys', keys);
  app.route('/v1/export', exportRoutes);
  app.route('/v1/profile', profile);

  return app;
}

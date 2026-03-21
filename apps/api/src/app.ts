import { Hono } from 'hono';
import type { Env } from './env.js';
import type { Adapters } from './lib/adapters.js';
import { requestIdMiddleware } from './middleware/index.js';
import { webhooks } from './routes/webhooks.js';
import { usage } from './routes/usage.js';
import { keys } from './routes/keys.js';

// Context variables set by middleware
export interface AppVariables {
  requestId: string;
  tenantId: string;
  tenantPlan: string;
  apiKeyScopes: string[];
  adapters: Adapters;
  validatedBody: unknown;
}

export type AppType = Hono<{ Bindings: Env; Variables: AppVariables }>;

export function createApp(): AppType {
  const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  // Request ID on every request
  app.use('*', requestIdMiddleware());

  // Health check — no auth required
  app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

  // Authenticated routes
  app.route('/v1/webhooks', webhooks);
  app.route('/v1/usage', usage);
  app.route('/v1/keys', keys);

  return app;
}

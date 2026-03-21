import { Hono } from 'hono';
import type { Env } from './env.js';
import type { Adapters } from './lib/adapters.js';

// Context variables set by middleware
export interface AppVariables {
  requestId: string;
  tenantId: string;
  tenantPlan: string;
  apiKeyScopes: string[];
  adapters: Adapters;
}

export type AppType = Hono<{ Bindings: Env; Variables: AppVariables }>;

export function createApp(): AppType {
  const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  // Health check — no auth required
  app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

  return app;
}

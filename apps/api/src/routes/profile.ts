import { Hono } from 'hono';
import type { Env } from '../env.js';
import type { AppVariables } from '../app.js';
import { getAdapters } from '../lib/context.js';
import { successResponse } from '../lib/response.js';
import { authMiddleware, badRequest } from '../middleware/index.js';
import { getUserProfile } from '@steno-ai/engine';

const profile = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// GET /v1/profile?scope=user&scope_id=user_123
profile.get('/', authMiddleware('read'), async (c) => {
  const scope = c.req.query('scope');
  const scopeId = c.req.query('scope_id');

  if (!scope || !scopeId) {
    throw badRequest('scope and scope_id are required');
  }

  const tenantId = c.get('tenantId');
  const adapters = getAdapters(c);

  const userProfile = await getUserProfile(adapters.storage, tenantId, scopeId);

  return successResponse(c, userProfile);
});

export { profile };

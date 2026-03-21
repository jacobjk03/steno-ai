import { Hono } from 'hono';
import type { Env } from '../env.js';
import type { AppVariables } from '../app.js';
import { getAdapters } from '../lib/context.js';
import { successResponse } from '../lib/response.js';
import { authMiddleware } from '../middleware/index.js';

const usage = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// GET /v1/usage — current month's usage stats (read)
usage.get('/', authMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId');
  const adapters = getAdapters(c);

  const record = await adapters.storage.getCurrentUsage(tenantId);

  if (!record) {
    // No usage recorded yet — return zeroed-out stats
    return successResponse(c, {
      tokensUsed: 0,
      queriesUsed: 0,
      extractionsCount: 0,
      costUsd: 0,
    });
  }

  return successResponse(c, {
    id: record.id,
    periodStart: record.periodStart,
    periodEnd: record.periodEnd,
    tokensUsed: record.tokensUsed,
    queriesUsed: record.queriesUsed,
    extractionsCount: record.extractionsCount,
    costUsd: record.costUsd,
  });
});

export { usage };

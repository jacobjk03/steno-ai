import { Hono } from 'hono';
import type { Env } from '../env.js';
import type { AppVariables } from '../app.js';
import { getAdapters } from '../lib/context.js';
import { successResponse, paginatedResponse } from '../lib/response.js';
import { authMiddleware, notFound } from '../middleware/index.js';

const extractions = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// GET /v1/extractions — List extractions (paginated)
extractions.get(
  '/',
  authMiddleware('read'),
  async (c) => {
    const tenantId = c.get('tenantId');
    const { storage } = getAdapters(c);

    const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10) || 20, 100);
    const cursor = c.req.query('cursor');

    const result = await storage.getExtractionsByTenant(tenantId, { limit, cursor });
    return paginatedResponse(c, result.data, result.cursor, result.hasMore);
  },
);

// GET /v1/extractions/:id — Get extraction status + results
extractions.get(
  '/:id',
  authMiddleware('read'),
  async (c) => {
    const tenantId = c.get('tenantId');
    const extractionId = c.req.param('id');
    const { storage } = getAdapters(c);

    const extraction = await storage.getExtraction(tenantId, extractionId);
    if (!extraction) {
      throw notFound(`Extraction ${extractionId} not found`);
    }

    return successResponse(c, extraction);
  },
);

export { extractions };

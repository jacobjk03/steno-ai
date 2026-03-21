import { Hono } from 'hono';
import type { Env } from '../env.js';
import type { AppVariables } from '../app.js';
import { getAdapters } from '../lib/context.js';
import { successResponse, paginatedResponse } from '../lib/response.js';
import { authMiddleware, notFound } from '../middleware/index.js';

const entities = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// GET /v1/entities — List entities for tenant (paginated)
entities.get(
  '/',
  authMiddleware('read'),
  async (c) => {
    const tenantId = c.get('tenantId');
    const { storage } = getAdapters(c);

    const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10) || 20, 100);
    const cursor = c.req.query('cursor');

    const result = await storage.getEntitiesForTenant(tenantId, { limit, cursor });
    return paginatedResponse(c, result.data, result.cursor, result.hasMore);
  },
);

// GET /v1/entities/:id — Get entity by id
entities.get(
  '/:id',
  authMiddleware('read'),
  async (c) => {
    const tenantId = c.get('tenantId');
    const entityId = c.req.param('id');
    const { storage } = getAdapters(c);

    const entity = await storage.getEntity(tenantId, entityId);
    if (!entity) {
      throw notFound(`Entity ${entityId} not found`);
    }

    return successResponse(c, entity);
  },
);

// GET /v1/entities/:id/graph — Get entity with relationships
entities.get(
  '/:id/graph',
  authMiddleware('read'),
  async (c) => {
    const tenantId = c.get('tenantId');
    const entityId = c.req.param('id');
    const { storage } = getAdapters(c);

    // Validate depth param (default 3, max 5)
    const rawDepth = c.req.query('depth');
    let depth = 3;
    if (rawDepth !== undefined) {
      depth = parseInt(rawDepth, 10);
      if (isNaN(depth) || depth < 1) depth = 1;
      if (depth > 5) depth = 5;
    }

    // Check entity exists
    const entity = await storage.getEntity(tenantId, entityId);
    if (!entity) {
      throw notFound(`Entity ${entityId} not found`);
    }

    const graph = await storage.graphTraversal({
      tenantId,
      entityIds: [entityId],
      maxDepth: depth,
      maxEntities: 50,
    });

    return successResponse(c, {
      entity,
      graph,
    });
  },
);

export { entities };

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../env.js';
import type { AppVariables } from '../app.js';
import { getAdapters } from '../lib/context.js';
import { successResponse } from '../lib/response.js';
import { validate } from '../middleware/validate.js';
import { authMiddleware } from '../middleware/auth.js';
import { search } from '@steno-ai/engine';

const SearchBodySchema = z.object({
  query: z.string().min(1).max(5000),
  scope: z.string().min(1),
  scopeId: z.string().min(1),
  limit: z.number().int().min(1).max(100).optional().default(10),
  includeGraph: z.boolean().optional().default(false),
  includeHistory: z.boolean().optional().default(false),
  temporalFilter: z.object({
    asOf: z.coerce.date().optional(),
  }).optional(),
  weights: z.object({
    vector: z.number().min(0).max(1),
    keyword: z.number().min(0).max(1),
    graph: z.number().min(0).max(1),
    recency: z.number().min(0).max(1),
    salience: z.number().min(0).max(1),
  }).optional(),
});

const searchRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// POST /v1/memory/search -- Sync fusion search
searchRoutes.post('/', authMiddleware('read'), validate(SearchBodySchema), async (c) => {
  const body = c.get('validatedBody') as z.infer<typeof SearchBodySchema>;
  const adapters = getAdapters(c);
  const tenantId = c.get('tenantId');

  const result = await search(
    {
      storage: adapters.storage,
      embedding: adapters.embedding,
      defaultWeights: undefined,
      salienceHalfLifeDays: undefined,
      salienceNormalizationK: undefined,
      graphMaxDepth: undefined,
      graphMaxEntities: undefined,
    },
    {
      query: body.query,
      tenantId,
      scope: body.scope,
      scopeId: body.scopeId,
      limit: body.limit,
      includeGraph: body.includeGraph,
      includeHistory: body.includeHistory,
      temporalFilter: body.temporalFilter,
      weights: body.weights,
    },
  );

  return successResponse(c, result);
});

// POST /v1/memory/search/batch -- Sync batch search
const BatchSearchSchema = z.object({
  queries: z.array(SearchBodySchema).min(1).max(50),
});

searchRoutes.post('/batch', authMiddleware('read'), validate(BatchSearchSchema), async (c) => {
  const body = c.get('validatedBody') as z.infer<typeof BatchSearchSchema>;
  const adapters = getAdapters(c);
  const tenantId = c.get('tenantId');

  const results = await Promise.all(
    body.queries.map(q => search(
      { storage: adapters.storage, embedding: adapters.embedding },
      { ...q, tenantId },
    ))
  );

  return successResponse(c, { results });
});

export { searchRoutes };

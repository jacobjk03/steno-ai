import { Hono } from 'hono';
import { z } from 'zod';
import { SESSION_SCOPES } from '@steno-ai/engine';
import type { Env } from '../env.js';
import type { AppVariables } from '../app.js';
import { getAdapters } from '../lib/context.js';
import { successResponse, paginatedResponse, errorResponse } from '../lib/response.js';
import { toCamelCaseWire } from '../lib/wire-format.js';
import { authMiddleware, validate, notFound } from '../middleware/index.js';
import { startSession, endSession } from '@steno-ai/engine';

const StartSessionSchema = z.object({
  scope: z.enum(SESSION_SCOPES),
  scopeId: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const sessions = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// POST /v1/sessions — Start a new session
sessions.post(
  '/',
  authMiddleware('write'),
  validate(StartSessionSchema),
  async (c) => {
    const body = c.get('validatedBody') as z.infer<typeof StartSessionSchema>;
    const tenantId = c.get('tenantId');
    const { storage } = getAdapters(c);

    const session = await startSession(
      storage,
      tenantId,
      body.scope,
      body.scopeId,
      body.metadata,
    );

    return successResponse(c, session, 201);
  },
);

// POST /v1/sessions/:id/end — End a session (auto-summarize)
sessions.post(
  '/:id/end',
  authMiddleware('write'),
  async (c) => {
    const tenantId = c.get('tenantId');
    const sessionId = c.req.param('id');
    const adapters = getAdapters(c);

    try {
      const session = await endSession(
        adapters.storage,
        adapters.cheapLLM,
        tenantId,
        sessionId,
      );
      return successResponse(c, session);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('not found')) {
        throw notFound(`Session ${sessionId} not found`);
      }
      if (message.includes('already ended')) {
        return errorResponse(c, 'bad_request', `Session ${sessionId} already ended`, 400);
      }
      throw err;
    }
  },
);

// GET /v1/sessions — List sessions (scope, scope_id, paginated)
sessions.get(
  '/',
  authMiddleware('read'),
  async (c) => {
    const tenantId = c.get('tenantId');
    const { storage } = getAdapters(c);

    const rawScope = c.req.query('scope');
    const scopeId = c.req.query('scope_id');
    const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10) || 20, 100);
    const cursor = c.req.query('cursor');

    if (!rawScope || !scopeId) {
      return errorResponse(c, 'bad_request', 'scope and scope_id query params are required', 400);
    }

    // Validate scope value
    const scopeParse = z.enum(SESSION_SCOPES).safeParse(rawScope);
    if (!scopeParse.success) {
      return errorResponse(c, 'bad_request', `Invalid scope: ${rawScope}`, 400);
    }
    const scope = scopeParse.data;

    const result = await storage.getSessionsByScope(tenantId, scope, scopeId, { limit, cursor });
    return paginatedResponse(c, result.data, result.cursor, result.hasMore);
  },
);

export { sessions };

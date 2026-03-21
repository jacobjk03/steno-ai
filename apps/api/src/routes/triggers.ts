import { Hono } from 'hono';
import { z } from 'zod';
import { SCOPES, CreateTriggerSchema } from '@steno-ai/engine';
import type { CreateTrigger } from '@steno-ai/engine';
import type { Env } from '../env.js';
import type { AppVariables } from '../app.js';
import { getAdapters } from '../lib/context.js';
import { successResponse, errorResponse } from '../lib/response.js';
import { toCamelCaseWire } from '../lib/wire-format.js';
import { authMiddleware, validate, notFound } from '../middleware/index.js';

// Wire-format schema for creating a trigger (tenantId is injected from auth)
const CreateTriggerBodySchema = z.object({
  scope: z.enum(SCOPES),
  scopeId: z.string().min(1),
  condition: z.record(z.unknown()),
  factIds: z.array(z.string().uuid()).default([]),
  entityIds: z.array(z.string().uuid()).default([]),
  queryTemplate: z.string().optional(),
  priority: z.number().int().default(0),
});

const UpdateTriggerBodySchema = z.object({
  condition: z.record(z.unknown()).optional(),
  factIds: z.array(z.string().uuid()).optional(),
  entityIds: z.array(z.string().uuid()).optional(),
  queryTemplate: z.string().nullable().optional(),
  priority: z.number().int().optional(),
  active: z.boolean().optional(),
});

const triggers = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// POST /v1/triggers — Create trigger
triggers.post(
  '/',
  authMiddleware('write'),
  validate(CreateTriggerBodySchema),
  async (c) => {
    const body = c.get('validatedBody') as z.infer<typeof CreateTriggerBodySchema>;
    const tenantId = c.get('tenantId');
    const { storage } = getAdapters(c);

    const id = crypto.randomUUID();
    const trigger = await storage.createTrigger({
      id,
      tenantId,
      scope: body.scope,
      scopeId: body.scopeId,
      condition: body.condition,
      factIds: body.factIds,
      entityIds: body.entityIds,
      queryTemplate: body.queryTemplate,
      priority: body.priority,
    });

    return successResponse(c, trigger, 201);
  },
);

// GET /v1/triggers — List triggers (scope, scope_id)
triggers.get(
  '/',
  authMiddleware('read'),
  async (c) => {
    const tenantId = c.get('tenantId');
    const { storage } = getAdapters(c);

    const rawScope = c.req.query('scope');
    const scopeId = c.req.query('scope_id');

    if (!rawScope || !scopeId) {
      return errorResponse(c, 'bad_request', 'scope and scope_id query params are required', 400);
    }

    const scopeParse = z.enum(SCOPES).safeParse(rawScope);
    if (!scopeParse.success) {
      return errorResponse(c, 'bad_request', `Invalid scope: ${rawScope}`, 400);
    }
    const scope = scopeParse.data;

    const result = await storage.getActiveTriggers(tenantId, scope, scopeId);
    return successResponse(c, result);
  },
);

// PATCH /v1/triggers/:id — Update trigger
triggers.patch(
  '/:id',
  authMiddleware('write'),
  validate(UpdateTriggerBodySchema),
  async (c) => {
    const tenantId = c.get('tenantId');
    const triggerId = c.req.param('id');
    const body = c.get('validatedBody') as z.infer<typeof UpdateTriggerBodySchema>;
    const { storage } = getAdapters(c);

    const existing = await storage.getTrigger(tenantId, triggerId);
    if (!existing) {
      throw notFound(`Trigger ${triggerId} not found`);
    }

    const updated = await storage.updateTrigger(tenantId, triggerId, body);
    return successResponse(c, updated);
  },
);

// DELETE /v1/triggers/:id — Delete trigger
triggers.delete(
  '/:id',
  authMiddleware('write'),
  async (c) => {
    const tenantId = c.get('tenantId');
    const triggerId = c.req.param('id');
    const { storage } = getAdapters(c);

    const existing = await storage.getTrigger(tenantId, triggerId);
    if (!existing) {
      throw notFound(`Trigger ${triggerId} not found`);
    }

    await storage.deleteTrigger(tenantId, triggerId);
    return successResponse(c, { id: triggerId, deleted: true });
  },
);

export { triggers };

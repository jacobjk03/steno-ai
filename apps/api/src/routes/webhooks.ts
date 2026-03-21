import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../env.js';
import type { AppVariables } from '../app.js';
import { getAdapters } from '../lib/context.js';
import { successResponse, errorResponse } from '../lib/response.js';
import { authMiddleware, validate } from '../middleware/index.js';
import { WEBHOOK_EVENTS } from '@steno-ai/engine';

// ---------- validation schemas ----------

const CreateWebhookBodySchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
  secret: z.string().min(16),
});

// ---------- router ----------

const webhooks = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// POST /v1/webhooks — register a new webhook (admin)
webhooks.post(
  '/',
  authMiddleware('admin'),
  validate(CreateWebhookBodySchema),
  async (c) => {
    const body = c.get('validatedBody') as z.infer<typeof CreateWebhookBodySchema>;
    const tenantId = c.get('tenantId');
    const adapters = getAdapters(c);

    // Hash the secret before storing
    const encoder = new TextEncoder();
    const keyData = encoder.encode(body.secret);
    const hashBuffer = await crypto.subtle.digest('SHA-256', keyData);
    const secretHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const id = crypto.randomUUID();
    const webhook = await adapters.storage.createWebhook({
      id,
      tenantId,
      url: body.url,
      events: body.events,
      secret: body.secret,
      secretHash,
    });

    // Return webhook WITHOUT the secret
    return successResponse(
      c,
      {
        id: webhook.id,
        url: webhook.url,
        events: webhook.events,
        active: webhook.active,
        createdAt: webhook.createdAt,
      },
      201,
    );
  },
);

// GET /v1/webhooks — list webhooks for tenant (read)
webhooks.get('/', authMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId');
  const adapters = getAdapters(c);
  const list = await adapters.storage.getWebhooksForTenant(tenantId);

  // Strip secretHash from each webhook
  const safe = list.map((w) => ({
    id: w.id,
    url: w.url,
    events: w.events,
    active: w.active,
    createdAt: w.createdAt,
  }));

  return successResponse(c, safe);
});

// DELETE /v1/webhooks/:id — remove webhook (admin)
webhooks.delete('/:id', authMiddleware('admin'), async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const adapters = getAdapters(c);

  const existing = await adapters.storage.getWebhook(tenantId, id);
  if (!existing) {
    return errorResponse(c, 'not_found', 'Webhook not found', 404);
  }

  await adapters.storage.deleteWebhook(tenantId, id);
  return successResponse(c, { id, deleted: true });
});

export { webhooks };

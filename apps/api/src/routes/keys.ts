import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../env.js';
import type { AppVariables } from '../app.js';
import { getAdapters } from '../lib/context.js';
import { successResponse, errorResponse } from '../lib/response.js';
import { authMiddleware, validate } from '../middleware/index.js';
import { generateApiKey, hashApiKey, API_KEY_SCOPES } from '@steno-ai/engine';

// ---------- validation schemas ----------

const CreateKeyBodySchema = z.object({
  name: z.string().max(100).default('Default'),
  scopes: z.array(z.enum(API_KEY_SCOPES)).default(['read', 'write']),
  expiresAt: z.coerce.date().optional(),
});

// ---------- router ----------

const keys = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// GET /v1/keys — list API keys (admin). Shows prefix + name + scopes, NOT hash.
keys.get('/', authMiddleware('admin'), async (c) => {
  const tenantId = c.get('tenantId');
  const adapters = getAdapters(c);
  const list = await adapters.storage.getApiKeysForTenant(tenantId);

  const safe = list.map((k) => ({
    id: k.id,
    name: k.name,
    keyPrefix: k.keyPrefix,
    scopes: k.scopes,
    active: k.active,
    expiresAt: k.expiresAt,
    lastUsedAt: k.lastUsedAt,
    createdAt: k.createdAt,
  }));

  return successResponse(c, safe);
});

// POST /v1/keys — create a new API key (admin). Returns full key ONCE.
keys.post(
  '/',
  authMiddleware('admin'),
  validate(CreateKeyBodySchema),
  async (c) => {
    const body = c.get('validatedBody') as z.infer<typeof CreateKeyBodySchema>;
    const tenantId = c.get('tenantId');
    const adapters = getAdapters(c);

    const { key, prefix } = generateApiKey();
    const keyHash = await hashApiKey(key);
    const id = crypto.randomUUID();

    const created = await adapters.storage.createApiKey({
      id,
      tenantId,
      name: body.name,
      scopes: body.scopes,
      expiresAt: body.expiresAt,
      keyHash,
      keyPrefix: prefix,
    });

    // Return full key ONCE — it cannot be retrieved again
    return successResponse(
      c,
      {
        id: created.id,
        key,
        name: created.name,
        keyPrefix: created.keyPrefix,
        scopes: created.scopes,
        active: created.active,
        expiresAt: created.expiresAt,
        createdAt: created.createdAt,
      },
      201,
    );
  },
);

// DELETE /v1/keys/:id — revoke an API key (admin)
keys.delete('/:id', authMiddleware('admin'), async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const adapters = getAdapters(c);

  // Attempt to revoke — getApiKeysForTenant would be expensive just to check existence,
  // so we let the storage layer handle not-found gracefully.
  await adapters.storage.revokeApiKey(tenantId, id);
  return successResponse(c, { id, revoked: true });
});

export { keys };

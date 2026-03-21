import type { MiddlewareHandler } from 'hono';
import { extractPrefix, verifyApiKey } from '@steno-ai/engine';
import { getAdapters } from '../lib/context.js';

export function authMiddleware(requiredScope?: string): MiddlewareHandler {
  return async (c, next) => {
    // Idempotent: if already authenticated (global auth ran), just check scope
    const existingTenantId = c.get('tenantId');
    if (existingTenantId) {
      if (requiredScope && !(c.get('apiKeyScopes') as readonly string[]).includes(requiredScope)) {
        return c.json(
          {
            error: {
              code: 'forbidden',
              message: `API key does not have required scope: ${requiredScope}`,
              status: 403,
              request_id: c.get('requestId'),
            },
          },
          403,
        );
      }
      await next();
      return;
    }

    // 1. Extract Bearer token from Authorization header
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json(
        {
          error: {
            code: 'unauthorized',
            message: 'Missing or invalid Authorization header',
            status: 401,
            request_id: c.get('requestId'),
          },
        },
        401,
      );
    }

    const token = authHeader.slice(7); // Remove "Bearer "

    // 2. Extract prefix
    const prefix = extractPrefix(token);

    // 3. Look up API key by prefix
    const adapters = getAdapters(c);
    const apiKeyRecord = await adapters.storage.getApiKeyByPrefix(prefix);

    if (!apiKeyRecord) {
      return c.json(
        {
          error: {
            code: 'unauthorized',
            message: 'Invalid API key',
            status: 401,
            request_id: c.get('requestId'),
          },
        },
        401,
      );
    }

    // 4. Verify full key against bcrypt hash
    const valid = await verifyApiKey(token, apiKeyRecord.keyHash);
    if (!valid) {
      return c.json(
        {
          error: {
            code: 'unauthorized',
            message: 'Invalid API key',
            status: 401,
            request_id: c.get('requestId'),
          },
        },
        401,
      );
    }

    // 5. Check key is active and not expired
    if (!apiKeyRecord.active) {
      return c.json(
        {
          error: {
            code: 'unauthorized',
            message: 'API key has been revoked',
            status: 401,
            request_id: c.get('requestId'),
          },
        },
        401,
      );
    }

    if (apiKeyRecord.expiresAt && new Date(apiKeyRecord.expiresAt) < new Date()) {
      return c.json(
        {
          error: {
            code: 'unauthorized',
            message: 'API key has expired',
            status: 401,
            request_id: c.get('requestId'),
          },
        },
        401,
      );
    }

    // 6. Check scope if required
    if (requiredScope && !(apiKeyRecord.scopes as readonly string[]).includes(requiredScope)) {
      return c.json(
        {
          error: {
            code: 'forbidden',
            message: `API key does not have required scope: ${requiredScope}`,
            status: 403,
            request_id: c.get('requestId'),
          },
        },
        403,
      );
    }

    // 7. Get tenant
    const tenant = await adapters.storage.getTenant(apiKeyRecord.tenantId);
    if (!tenant || !tenant.active) {
      return c.json(
        {
          error: {
            code: 'unauthorized',
            message: 'Tenant not found or inactive',
            status: 401,
            request_id: c.get('requestId'),
          },
        },
        401,
      );
    }

    // 8. Set context
    c.set('tenantId', tenant.id);
    c.set('tenantPlan', tenant.plan);
    c.set('apiKeyScopes', apiKeyRecord.scopes);

    // 9. Update last_used_at (fire-and-forget)
    void adapters.storage.updateApiKeyLastUsed(apiKeyRecord.id).catch(() => {});

    await next();
  };
}

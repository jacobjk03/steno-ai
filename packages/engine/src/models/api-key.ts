import { z } from 'zod';
import { API_KEY_SCOPES } from '../config.js';

export const ApiKeySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  keyHash: z.string(),
  keyPrefix: z.string(),
  name: z.string().max(100),
  scopes: z.array(z.enum(API_KEY_SCOPES)),
  expiresAt: z.coerce.date().nullable(),
  lastUsedAt: z.coerce.date().nullable(),
  active: z.boolean(),
  createdAt: z.coerce.date(),
});

export type ApiKey = z.infer<typeof ApiKeySchema>;

export const CreateApiKeySchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().max(100).default('Default'),
  scopes: z.array(z.enum(API_KEY_SCOPES)).default(['read', 'write']),
  expiresAt: z.coerce.date().optional(),
});

export type CreateApiKey = z.infer<typeof CreateApiKeySchema>;

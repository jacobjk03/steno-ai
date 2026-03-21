import { z } from 'zod';

export const EntitySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().max(500),
  entityType: z.string(),
  canonicalName: z.string(),
  properties: z.record(z.string(), z.unknown()),
  embeddingModel: z.string().nullable(),
  embeddingDim: z.number().int().positive().nullable(),
  mergeTargetId: z.string().uuid().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Entity = z.infer<typeof EntitySchema>;

export const CreateEntitySchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().max(500),
  entityType: z.string(),
  canonicalName: z.string(),
  properties: z.record(z.string(), z.unknown()).default({}),
});

export type CreateEntity = z.infer<typeof CreateEntitySchema>;

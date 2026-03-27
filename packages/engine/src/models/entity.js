import { z } from 'zod';
export const EntitySchema = z.object({
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    name: z.string().min(1).max(500),
    entityType: z.string().min(1),
    canonicalName: z.string().min(1),
    properties: z.record(z.string(), z.unknown()),
    embeddingModel: z.string().nullable(),
    embeddingDim: z.number().int().positive().nullable(),
    mergeTargetId: z.string().uuid().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
});
export const CreateEntitySchema = z.object({
    tenantId: z.string().uuid(),
    name: z.string().min(1).max(500),
    entityType: z.string().min(1),
    canonicalName: z.string().min(1),
    properties: z.record(z.string(), z.unknown()).default({}),
});
//# sourceMappingURL=entity.js.map
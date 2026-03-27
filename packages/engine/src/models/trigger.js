import { z } from 'zod';
import { SCOPES } from '../config.js';
export const TriggerConditionSchema = z.lazy(() => z.object({
    topic_match: z.array(z.string()).optional(),
    entity_present: z.array(z.string()).optional(),
    keyword_any: z.array(z.string()).optional(),
    semantic_similarity: z
        .object({
        text: z.string(),
        threshold: z.number().min(0).max(1),
    })
        .optional(),
    AND: z.array(TriggerConditionSchema).optional(),
    OR: z.array(TriggerConditionSchema).optional(),
}));
export const TriggerSchema = z.object({
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    scope: z.enum(SCOPES),
    scopeId: z.string().min(1),
    condition: TriggerConditionSchema,
    factIds: z.array(z.string().uuid()),
    entityIds: z.array(z.string().uuid()),
    queryTemplate: z.string().nullable(),
    priority: z.number().int().default(0),
    active: z.boolean().default(true),
    timesFired: z.number().int().nonnegative().default(0),
    lastFiredAt: z.coerce.date().nullable(),
    createdAt: z.coerce.date(),
});
export const CreateTriggerSchema = z.object({
    tenantId: z.string().uuid(),
    scope: z.enum(SCOPES),
    scopeId: z.string().min(1),
    condition: TriggerConditionSchema,
    factIds: z.array(z.string().uuid()).default([]),
    entityIds: z.array(z.string().uuid()).default([]),
    queryTemplate: z.string().optional(),
    priority: z.number().int().default(0),
});
//# sourceMappingURL=trigger.js.map
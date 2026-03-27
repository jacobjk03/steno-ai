import { z } from 'zod';
import { unitFloat, EDGE_TYPES } from '../config.js';
export const EdgeSchema = z.object({
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    sourceId: z.string().uuid(),
    targetId: z.string().uuid(),
    relation: z.string(),
    edgeType: z.enum(EDGE_TYPES),
    weight: z.number().min(0).default(1.0),
    validFrom: z.coerce.date(),
    validUntil: z.coerce.date().nullable(),
    factId: z.string().uuid().nullable(),
    confidence: unitFloat,
    metadata: z.record(z.string(), z.unknown()),
    createdAt: z.coerce.date(),
});
export const CreateEdgeSchema = z.object({
    tenantId: z.string().uuid(),
    sourceId: z.string().uuid(),
    targetId: z.string().uuid(),
    relation: z.string(),
    edgeType: z.enum(EDGE_TYPES),
    weight: z.number().min(0).default(1.0),
    factId: z.string().uuid().optional(),
    confidence: unitFloat.default(0.8),
    metadata: z.record(z.string(), z.unknown()).default({}),
});
//# sourceMappingURL=edge.js.map
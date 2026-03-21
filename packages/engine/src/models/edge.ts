import { z } from 'zod';
import { unitFloat, EDGE_TYPES } from '../config.js';

export const EdgeSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
  relation: z.string(),
  edgeType: z.enum(EDGE_TYPES),
  weight: z.number(),
  validFrom: z.coerce.date().nullable(),
  validUntil: z.coerce.date().nullable(),
  factId: z.string().uuid().nullable(),
  confidence: unitFloat,
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.coerce.date(),
});

export type Edge = z.infer<typeof EdgeSchema>;

export const CreateEdgeSchema = z.object({
  tenantId: z.string().uuid(),
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
  relation: z.string(),
  edgeType: z.enum(EDGE_TYPES),
  weight: z.number().default(1.0),
  factId: z.string().uuid().optional(),
  confidence: unitFloat.default(0.8),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type CreateEdge = z.infer<typeof CreateEdgeSchema>;

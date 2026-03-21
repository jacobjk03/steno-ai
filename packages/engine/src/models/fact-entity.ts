import { z } from 'zod';
import { ENTITY_ROLES } from '../config.js';

export const FactEntitySchema = z.object({
  factId: z.string().uuid(),
  entityId: z.string().uuid(),
  role: z.enum(ENTITY_ROLES),
  createdAt: z.coerce.date(),
});

export type FactEntity = z.infer<typeof FactEntitySchema>;

export const CreateFactEntitySchema = z.object({
  factId: z.string().uuid(),
  entityId: z.string().uuid(),
  role: z.enum(ENTITY_ROLES).default('mentioned'),
});

export type CreateFactEntity = z.infer<typeof CreateFactEntitySchema>;

import { z } from 'zod';

export const SessionMessageSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  tenantId: z.string().uuid(),
  role: z.string().min(1).default('user'),
  content: z.string().min(1),
  turnNumber: z.number().int().nonnegative(),
  extractionId: z.string().uuid().nullable(),
  createdAt: z.coerce.date(),
});

export type SessionMessage = z.infer<typeof SessionMessageSchema>;

export const CreateSessionMessageSchema = SessionMessageSchema.omit({
  id: true,
  extractionId: true,
  createdAt: true,
}).extend({
  extractionId: z.string().uuid().nullable().optional(),
});

export type CreateSessionMessage = z.infer<typeof CreateSessionMessageSchema>;

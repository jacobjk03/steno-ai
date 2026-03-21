import { z } from 'zod';
import { SESSION_SCOPES } from '../config.js';

export const SessionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  scope: z.enum(SESSION_SCOPES),
  scopeId: z.string().uuid(),
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date().nullable(),
  summary: z.string().nullable(),
  topics: z.array(z.string()).default([]),
  messageCount: z.number().int().nonnegative().default(0),
  factCount: z.number().int().nonnegative().default(0),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.coerce.date(),
});

export type Session = z.infer<typeof SessionSchema>;

export const CreateSessionSchema = z.object({
  tenantId: z.string().uuid(),
  scope: z.enum(SESSION_SCOPES),
  scopeId: z.string().uuid(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type CreateSession = z.infer<typeof CreateSessionSchema>;

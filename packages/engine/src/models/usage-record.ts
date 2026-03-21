import { z } from 'zod';

export const UsageRecordSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  tokensUsed: z.number().int().nonnegative(),
  queriesUsed: z.number().int().nonnegative(),
  extractionsCount: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type UsageRecord = z.infer<typeof UsageRecordSchema>;

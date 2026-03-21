import { z } from 'zod';
import { EXTRACTION_STATUSES, INPUT_TYPES, SCOPES, EXTRACTION_TIERS_USED } from '../config.js';

export const ExtractionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  status: z.enum(EXTRACTION_STATUSES),
  inputType: z.enum(INPUT_TYPES),
  inputData: z.union([z.string(), z.record(z.unknown())]).nullable(),
  inputHash: z.string(),
  inputSize: z.number().int().nonnegative().nullable(),
  scope: z.enum(SCOPES),
  scopeId: z.string().min(1),
  sessionId: z.string().uuid().nullable(),
  tierUsed: z.enum(EXTRACTION_TIERS_USED).nullable(),
  llmModel: z.string().nullable(),
  factsCreated: z.number().int().nonnegative(),
  factsUpdated: z.number().int().nonnegative(),
  factsInvalidated: z.number().int().nonnegative(),
  entitiesCreated: z.number().int().nonnegative(),
  edgesCreated: z.number().int().nonnegative(),
  costTokensInput: z.number().int().nonnegative(),
  costTokensOutput: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  durationMs: z.number().int().nonnegative().nullable(),
  error: z.string().nullable(),
  retryCount: z.number().int().nonnegative(),
  createdAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable(),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

export const CreateExtractionSchema = z.object({
  tenantId: z.string().uuid(),
  inputType: z.enum(INPUT_TYPES),
  inputData: z.string(),
  inputHash: z.string(),
  inputSize: z.number().int().nonnegative().optional(),
  scope: z.enum(SCOPES),
  scopeId: z.string().min(1),
  sessionId: z.string().uuid().optional(),
});

export type CreateExtraction = z.infer<typeof CreateExtractionSchema>;

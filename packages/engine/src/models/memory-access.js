import { z } from 'zod';
import { unitFloat, FEEDBACK_TYPES } from '../config.js';
export const MemoryAccessSchema = z.object({
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    factId: z.string().uuid(),
    query: z.string(),
    retrievalMethod: z.string(),
    similarityScore: unitFloat.nullable(),
    rankPosition: z.number().int().nonnegative().nullable(),
    wasUseful: z.boolean().nullable(),
    wasCorrected: z.boolean().default(false),
    feedbackType: z.enum(FEEDBACK_TYPES).nullable(),
    feedbackDetail: z.string().nullable(),
    triggerId: z.string().uuid().nullable(),
    accessedAt: z.coerce.date(),
});
export const CreateMemoryAccessSchema = z.object({
    tenantId: z.string().uuid(),
    factId: z.string().uuid(),
    query: z.string(),
    retrievalMethod: z.string(),
    similarityScore: unitFloat.optional(),
    rankPosition: z.number().int().nonnegative().optional(),
    triggerId: z.string().uuid().optional(),
});
export const SubmitFeedbackSchema = z.object({
    factId: z.string().uuid(),
    wasUseful: z.boolean(),
    feedbackType: z.enum(FEEDBACK_TYPES),
    feedbackDetail: z.string().optional(),
});
//# sourceMappingURL=memory-access.js.map
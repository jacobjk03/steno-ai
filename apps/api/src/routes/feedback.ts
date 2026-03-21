import { Hono } from 'hono';
import { z } from 'zod';
import { FEEDBACK_TYPES, submitFeedback } from '@steno-ai/engine';
import type { FeedbackType } from '@steno-ai/engine';
import type { Env } from '../env.js';
import type { AppVariables } from '../app.js';
import { getAdapters } from '../lib/context.js';
import { successResponse, errorResponse } from '../lib/response.js';
import { authMiddleware, validate } from '../middleware/index.js';

const FeedbackSchema = z.object({
  factId: z.string().uuid(),
  wasUseful: z.boolean(),
  feedbackType: z.enum(FEEDBACK_TYPES),
  feedbackDetail: z.string().optional(),
});

const BatchFeedbackSchema = z.object({
  items: z.array(FeedbackSchema).min(1).max(50),
});

const feedback = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// POST /v1/feedback — Submit feedback for a single fact
feedback.post(
  '/',
  authMiddleware('write'),
  validate(FeedbackSchema),
  async (c) => {
    const body = c.get('validatedBody') as z.infer<typeof FeedbackSchema>;
    const tenantId = c.get('tenantId');
    const { storage } = getAdapters(c);

    await submitFeedback(storage, tenantId, body.factId, {
      wasUseful: body.wasUseful,
      feedbackType: body.feedbackType,
      feedbackDetail: body.feedbackDetail,
    });

    return successResponse(c, { submitted: true }, 201);
  },
);

// POST /v1/feedback/batch — Submit feedback for multiple facts (max 50)
feedback.post(
  '/batch',
  authMiddleware('write'),
  validate(BatchFeedbackSchema),
  async (c) => {
    const body = c.get('validatedBody') as z.infer<typeof BatchFeedbackSchema>;
    const tenantId = c.get('tenantId');
    const { storage } = getAdapters(c);

    const results: Array<{ factId: string; success: boolean; error?: string }> = [];

    for (const item of body.items) {
      try {
        await submitFeedback(storage, tenantId, item.factId, {
          wasUseful: item.wasUseful,
          feedbackType: item.feedbackType,
          feedbackDetail: item.feedbackDetail,
        });
        results.push({ factId: item.factId, success: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        results.push({ factId: item.factId, success: false, error: message });
      }
    }

    return successResponse(c, { results }, 201);
  },
);

export { feedback };

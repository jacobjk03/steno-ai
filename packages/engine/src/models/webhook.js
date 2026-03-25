import { z } from 'zod';
export const WEBHOOK_EVENTS = [
    'extraction.completed',
    'extraction.failed',
    'trigger.fired',
    'usage.limit_approaching',
    'usage.limit_exceeded',
];
export const WebhookSchema = z.object({
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    url: z.string().url(),
    events: z.array(z.enum(WEBHOOK_EVENTS)),
    secretHash: z.string(),
    signingKey: z.string(), // raw secret for HMAC signing — stored encrypted at rest in production
    active: z.boolean().default(true),
    createdAt: z.coerce.date(),
});
export const CreateWebhookSchema = z.object({
    tenantId: z.string().uuid(),
    url: z.string().url(),
    events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
    secret: z.string().min(16),
});
//# sourceMappingURL=webhook.js.map
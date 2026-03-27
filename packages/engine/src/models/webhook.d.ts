import { z } from 'zod';
export declare const WEBHOOK_EVENTS: readonly ["extraction.completed", "extraction.failed", "trigger.fired", "usage.limit_approaching", "usage.limit_exceeded"];
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
export declare const WebhookSchema: z.ZodObject<{
    id: z.ZodString;
    tenantId: z.ZodString;
    url: z.ZodString;
    events: z.ZodArray<z.ZodEnum<["extraction.completed", "extraction.failed", "trigger.fired", "usage.limit_approaching", "usage.limit_exceeded"]>, "many">;
    secretHash: z.ZodString;
    signingKey: z.ZodString;
    active: z.ZodDefault<z.ZodBoolean>;
    createdAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    active: boolean;
    url: string;
    id: string;
    tenantId: string;
    createdAt: Date;
    events: ("extraction.completed" | "extraction.failed" | "trigger.fired" | "usage.limit_approaching" | "usage.limit_exceeded")[];
    secretHash: string;
    signingKey: string;
}, {
    url: string;
    id: string;
    tenantId: string;
    createdAt: Date;
    events: ("extraction.completed" | "extraction.failed" | "trigger.fired" | "usage.limit_approaching" | "usage.limit_exceeded")[];
    secretHash: string;
    signingKey: string;
    active?: boolean | undefined;
}>;
export type Webhook = z.infer<typeof WebhookSchema>;
export declare const CreateWebhookSchema: z.ZodObject<{
    tenantId: z.ZodString;
    url: z.ZodString;
    events: z.ZodArray<z.ZodEnum<["extraction.completed", "extraction.failed", "trigger.fired", "usage.limit_approaching", "usage.limit_exceeded"]>, "many">;
    secret: z.ZodString;
}, "strip", z.ZodTypeAny, {
    url: string;
    tenantId: string;
    events: ("extraction.completed" | "extraction.failed" | "trigger.fired" | "usage.limit_approaching" | "usage.limit_exceeded")[];
    secret: string;
}, {
    url: string;
    tenantId: string;
    events: ("extraction.completed" | "extraction.failed" | "trigger.fired" | "usage.limit_approaching" | "usage.limit_exceeded")[];
    secret: string;
}>;
export type CreateWebhook = z.infer<typeof CreateWebhookSchema>;
//# sourceMappingURL=webhook.d.ts.map
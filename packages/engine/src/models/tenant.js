import { z } from 'zod';
import { StenoConfigSchema, PLANS } from '../config.js';
export const TenantSchema = z.object({
    id: z.string().uuid(),
    name: z.string().max(100),
    slug: z.string().max(50).regex(/^[a-z0-9-]+$/),
    config: StenoConfigSchema,
    plan: z.enum(PLANS),
    tokenLimitMonthly: z.number().int().positive(),
    queryLimitMonthly: z.number().int().positive(),
    stripeCustomerId: z.string().nullable(),
    stripeSubscriptionId: z.string().nullable(),
    active: z.boolean(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
});
export const CreateTenantSchema = z.object({
    name: z.string().max(100),
    slug: z.string().max(50).regex(/^[a-z0-9-]+$/),
    plan: z.enum(PLANS).default('free'),
    config: StenoConfigSchema.default({}),
});
//# sourceMappingURL=tenant.js.map
import { z } from 'zod';
export declare const TenantSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    slug: z.ZodString;
    config: z.ZodObject<{
        embeddingModel: z.ZodDefault<z.ZodString>;
        embeddingDim: z.ZodDefault<z.ZodNumber>;
        decayHalfLifeDays: z.ZodDefault<z.ZodNumber>;
        decayNormalizationK: z.ZodDefault<z.ZodNumber>;
        maxFactsPerScope: z.ZodDefault<z.ZodNumber>;
        retrievalWeights: z.ZodDefault<z.ZodObject<{
            vector: z.ZodDefault<z.ZodNumber>;
            keyword: z.ZodDefault<z.ZodNumber>;
            graph: z.ZodDefault<z.ZodNumber>;
            recency: z.ZodDefault<z.ZodNumber>;
            salience: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            vector: number;
            keyword: number;
            graph: number;
            recency: number;
            salience: number;
        }, {
            vector?: number | undefined;
            keyword?: number | undefined;
            graph?: number | undefined;
            recency?: number | undefined;
            salience?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        embeddingModel: string;
        embeddingDim: number;
        decayHalfLifeDays: number;
        decayNormalizationK: number;
        maxFactsPerScope: number;
        retrievalWeights: {
            vector: number;
            keyword: number;
            graph: number;
            recency: number;
            salience: number;
        };
    }, {
        embeddingModel?: string | undefined;
        embeddingDim?: number | undefined;
        decayHalfLifeDays?: number | undefined;
        decayNormalizationK?: number | undefined;
        maxFactsPerScope?: number | undefined;
        retrievalWeights?: {
            vector?: number | undefined;
            keyword?: number | undefined;
            graph?: number | undefined;
            recency?: number | undefined;
            salience?: number | undefined;
        } | undefined;
    }>;
    plan: z.ZodEnum<["free", "pro", "scale", "enterprise"]>;
    tokenLimitMonthly: z.ZodNumber;
    queryLimitMonthly: z.ZodNumber;
    stripeCustomerId: z.ZodNullable<z.ZodString>;
    stripeSubscriptionId: z.ZodNullable<z.ZodString>;
    active: z.ZodBoolean;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    config: {
        embeddingModel: string;
        embeddingDim: number;
        decayHalfLifeDays: number;
        decayNormalizationK: number;
        maxFactsPerScope: number;
        retrievalWeights: {
            vector: number;
            keyword: number;
            graph: number;
            recency: number;
            salience: number;
        };
    };
    name: string;
    id: string;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
    slug: string;
    plan: "free" | "pro" | "scale" | "enterprise";
    tokenLimitMonthly: number;
    queryLimitMonthly: number;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
}, {
    config: {
        embeddingModel?: string | undefined;
        embeddingDim?: number | undefined;
        decayHalfLifeDays?: number | undefined;
        decayNormalizationK?: number | undefined;
        maxFactsPerScope?: number | undefined;
        retrievalWeights?: {
            vector?: number | undefined;
            keyword?: number | undefined;
            graph?: number | undefined;
            recency?: number | undefined;
            salience?: number | undefined;
        } | undefined;
    };
    name: string;
    id: string;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
    slug: string;
    plan: "free" | "pro" | "scale" | "enterprise";
    tokenLimitMonthly: number;
    queryLimitMonthly: number;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
}>;
export type Tenant = z.infer<typeof TenantSchema>;
export declare const CreateTenantSchema: z.ZodObject<{
    name: z.ZodString;
    slug: z.ZodString;
    plan: z.ZodDefault<z.ZodEnum<["free", "pro", "scale", "enterprise"]>>;
    config: z.ZodDefault<z.ZodObject<{
        embeddingModel: z.ZodDefault<z.ZodString>;
        embeddingDim: z.ZodDefault<z.ZodNumber>;
        decayHalfLifeDays: z.ZodDefault<z.ZodNumber>;
        decayNormalizationK: z.ZodDefault<z.ZodNumber>;
        maxFactsPerScope: z.ZodDefault<z.ZodNumber>;
        retrievalWeights: z.ZodDefault<z.ZodObject<{
            vector: z.ZodDefault<z.ZodNumber>;
            keyword: z.ZodDefault<z.ZodNumber>;
            graph: z.ZodDefault<z.ZodNumber>;
            recency: z.ZodDefault<z.ZodNumber>;
            salience: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            vector: number;
            keyword: number;
            graph: number;
            recency: number;
            salience: number;
        }, {
            vector?: number | undefined;
            keyword?: number | undefined;
            graph?: number | undefined;
            recency?: number | undefined;
            salience?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        embeddingModel: string;
        embeddingDim: number;
        decayHalfLifeDays: number;
        decayNormalizationK: number;
        maxFactsPerScope: number;
        retrievalWeights: {
            vector: number;
            keyword: number;
            graph: number;
            recency: number;
            salience: number;
        };
    }, {
        embeddingModel?: string | undefined;
        embeddingDim?: number | undefined;
        decayHalfLifeDays?: number | undefined;
        decayNormalizationK?: number | undefined;
        maxFactsPerScope?: number | undefined;
        retrievalWeights?: {
            vector?: number | undefined;
            keyword?: number | undefined;
            graph?: number | undefined;
            recency?: number | undefined;
            salience?: number | undefined;
        } | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    config: {
        embeddingModel: string;
        embeddingDim: number;
        decayHalfLifeDays: number;
        decayNormalizationK: number;
        maxFactsPerScope: number;
        retrievalWeights: {
            vector: number;
            keyword: number;
            graph: number;
            recency: number;
            salience: number;
        };
    };
    name: string;
    slug: string;
    plan: "free" | "pro" | "scale" | "enterprise";
}, {
    name: string;
    slug: string;
    config?: {
        embeddingModel?: string | undefined;
        embeddingDim?: number | undefined;
        decayHalfLifeDays?: number | undefined;
        decayNormalizationK?: number | undefined;
        maxFactsPerScope?: number | undefined;
        retrievalWeights?: {
            vector?: number | undefined;
            keyword?: number | undefined;
            graph?: number | undefined;
            recency?: number | undefined;
            salience?: number | undefined;
        } | undefined;
    } | undefined;
    plan?: "free" | "pro" | "scale" | "enterprise" | undefined;
}>;
export type CreateTenant = z.infer<typeof CreateTenantSchema>;
//# sourceMappingURL=tenant.d.ts.map
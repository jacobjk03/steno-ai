import { z } from 'zod';
export declare const UsageRecordSchema: z.ZodObject<{
    id: z.ZodString;
    tenantId: z.ZodString;
    periodStart: z.ZodDate;
    periodEnd: z.ZodDate;
    tokensUsed: z.ZodNumber;
    queriesUsed: z.ZodNumber;
    extractionsCount: z.ZodNumber;
    costUsd: z.ZodNumber;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    tenantId: string;
    createdAt: Date;
    updatedAt: Date;
    costUsd: number;
    periodStart: Date;
    periodEnd: Date;
    tokensUsed: number;
    queriesUsed: number;
    extractionsCount: number;
}, {
    id: string;
    tenantId: string;
    createdAt: Date;
    updatedAt: Date;
    costUsd: number;
    periodStart: Date;
    periodEnd: Date;
    tokensUsed: number;
    queriesUsed: number;
    extractionsCount: number;
}>;
export type UsageRecord = z.infer<typeof UsageRecordSchema>;
//# sourceMappingURL=usage-record.d.ts.map
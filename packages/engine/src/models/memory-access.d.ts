import { z } from 'zod';
export declare const MemoryAccessSchema: z.ZodObject<{
    id: z.ZodString;
    tenantId: z.ZodString;
    factId: z.ZodString;
    query: z.ZodString;
    retrievalMethod: z.ZodString;
    similarityScore: z.ZodNullable<z.ZodNumber>;
    rankPosition: z.ZodNullable<z.ZodNumber>;
    wasUseful: z.ZodNullable<z.ZodBoolean>;
    wasCorrected: z.ZodDefault<z.ZodBoolean>;
    feedbackType: z.ZodNullable<z.ZodEnum<["implicit_positive", "implicit_negative", "explicit_positive", "explicit_negative", "correction"]>>;
    feedbackDetail: z.ZodNullable<z.ZodString>;
    triggerId: z.ZodNullable<z.ZodString>;
    accessedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    query: string;
    id: string;
    tenantId: string;
    factId: string;
    retrievalMethod: string;
    similarityScore: number | null;
    rankPosition: number | null;
    wasUseful: boolean | null;
    wasCorrected: boolean;
    feedbackType: "implicit_positive" | "implicit_negative" | "explicit_positive" | "explicit_negative" | "correction" | null;
    feedbackDetail: string | null;
    triggerId: string | null;
    accessedAt: Date;
}, {
    query: string;
    id: string;
    tenantId: string;
    factId: string;
    retrievalMethod: string;
    similarityScore: number | null;
    rankPosition: number | null;
    wasUseful: boolean | null;
    feedbackType: "implicit_positive" | "implicit_negative" | "explicit_positive" | "explicit_negative" | "correction" | null;
    feedbackDetail: string | null;
    triggerId: string | null;
    accessedAt: Date;
    wasCorrected?: boolean | undefined;
}>;
export type MemoryAccess = z.infer<typeof MemoryAccessSchema>;
export declare const CreateMemoryAccessSchema: z.ZodObject<{
    tenantId: z.ZodString;
    factId: z.ZodString;
    query: z.ZodString;
    retrievalMethod: z.ZodString;
    similarityScore: z.ZodOptional<z.ZodNumber>;
    rankPosition: z.ZodOptional<z.ZodNumber>;
    triggerId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    query: string;
    tenantId: string;
    factId: string;
    retrievalMethod: string;
    similarityScore?: number | undefined;
    rankPosition?: number | undefined;
    triggerId?: string | undefined;
}, {
    query: string;
    tenantId: string;
    factId: string;
    retrievalMethod: string;
    similarityScore?: number | undefined;
    rankPosition?: number | undefined;
    triggerId?: string | undefined;
}>;
export type CreateMemoryAccess = z.infer<typeof CreateMemoryAccessSchema>;
export declare const SubmitFeedbackSchema: z.ZodObject<{
    factId: z.ZodString;
    wasUseful: z.ZodBoolean;
    feedbackType: z.ZodEnum<["implicit_positive", "implicit_negative", "explicit_positive", "explicit_negative", "correction"]>;
    feedbackDetail: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    factId: string;
    wasUseful: boolean;
    feedbackType: "implicit_positive" | "implicit_negative" | "explicit_positive" | "explicit_negative" | "correction";
    feedbackDetail?: string | undefined;
}, {
    factId: string;
    wasUseful: boolean;
    feedbackType: "implicit_positive" | "implicit_negative" | "explicit_positive" | "explicit_negative" | "correction";
    feedbackDetail?: string | undefined;
}>;
export type SubmitFeedback = z.infer<typeof SubmitFeedbackSchema>;
//# sourceMappingURL=memory-access.d.ts.map
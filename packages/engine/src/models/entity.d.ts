import { z } from 'zod';
export declare const EntitySchema: z.ZodObject<{
    id: z.ZodString;
    tenantId: z.ZodString;
    name: z.ZodString;
    entityType: z.ZodString;
    canonicalName: z.ZodString;
    properties: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    embeddingModel: z.ZodNullable<z.ZodString>;
    embeddingDim: z.ZodNullable<z.ZodNumber>;
    mergeTargetId: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    name: string;
    embeddingModel: string | null;
    embeddingDim: number | null;
    id: string;
    tenantId: string;
    createdAt: Date;
    entityType: string;
    canonicalName: string;
    properties: Record<string, unknown>;
    mergeTargetId: string | null;
    updatedAt: Date;
}, {
    name: string;
    embeddingModel: string | null;
    embeddingDim: number | null;
    id: string;
    tenantId: string;
    createdAt: Date;
    entityType: string;
    canonicalName: string;
    properties: Record<string, unknown>;
    mergeTargetId: string | null;
    updatedAt: Date;
}>;
export type Entity = z.infer<typeof EntitySchema>;
export declare const CreateEntitySchema: z.ZodObject<{
    tenantId: z.ZodString;
    name: z.ZodString;
    entityType: z.ZodString;
    canonicalName: z.ZodString;
    properties: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    tenantId: string;
    entityType: string;
    canonicalName: string;
    properties: Record<string, unknown>;
}, {
    name: string;
    tenantId: string;
    entityType: string;
    canonicalName: string;
    properties?: Record<string, unknown> | undefined;
}>;
export type CreateEntity = z.infer<typeof CreateEntitySchema>;
//# sourceMappingURL=entity.d.ts.map
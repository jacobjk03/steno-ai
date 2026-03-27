import { z } from 'zod';
export declare const EdgeSchema: z.ZodObject<{
    id: z.ZodString;
    tenantId: z.ZodString;
    sourceId: z.ZodString;
    targetId: z.ZodString;
    relation: z.ZodString;
    edgeType: z.ZodEnum<["associative", "causal", "temporal", "contradictory", "hierarchical", "updates", "extends", "derives"]>;
    weight: z.ZodDefault<z.ZodNumber>;
    validFrom: z.ZodDate;
    validUntil: z.ZodNullable<z.ZodDate>;
    factId: z.ZodNullable<z.ZodString>;
    confidence: z.ZodNumber;
    metadata: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    createdAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    tenantId: string;
    validFrom: Date;
    validUntil: Date | null;
    confidence: number;
    metadata: Record<string, unknown>;
    createdAt: Date;
    sourceId: string;
    targetId: string;
    relation: string;
    edgeType: "temporal" | "associative" | "causal" | "contradictory" | "hierarchical" | "updates" | "extends" | "derives";
    weight: number;
    factId: string | null;
}, {
    id: string;
    tenantId: string;
    validFrom: Date;
    validUntil: Date | null;
    confidence: number;
    metadata: Record<string, unknown>;
    createdAt: Date;
    sourceId: string;
    targetId: string;
    relation: string;
    edgeType: "temporal" | "associative" | "causal" | "contradictory" | "hierarchical" | "updates" | "extends" | "derives";
    factId: string | null;
    weight?: number | undefined;
}>;
export type Edge = z.infer<typeof EdgeSchema>;
export declare const CreateEdgeSchema: z.ZodObject<{
    tenantId: z.ZodString;
    sourceId: z.ZodString;
    targetId: z.ZodString;
    relation: z.ZodString;
    edgeType: z.ZodEnum<["associative", "causal", "temporal", "contradictory", "hierarchical", "updates", "extends", "derives"]>;
    weight: z.ZodDefault<z.ZodNumber>;
    factId: z.ZodOptional<z.ZodString>;
    confidence: z.ZodDefault<z.ZodNumber>;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    tenantId: string;
    confidence: number;
    metadata: Record<string, unknown>;
    sourceId: string;
    targetId: string;
    relation: string;
    edgeType: "temporal" | "associative" | "causal" | "contradictory" | "hierarchical" | "updates" | "extends" | "derives";
    weight: number;
    factId?: string | undefined;
}, {
    tenantId: string;
    sourceId: string;
    targetId: string;
    relation: string;
    edgeType: "temporal" | "associative" | "causal" | "contradictory" | "hierarchical" | "updates" | "extends" | "derives";
    confidence?: number | undefined;
    metadata?: Record<string, unknown> | undefined;
    weight?: number | undefined;
    factId?: string | undefined;
}>;
export type CreateEdge = z.infer<typeof CreateEdgeSchema>;
//# sourceMappingURL=edge.d.ts.map
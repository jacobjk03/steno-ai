import { z } from 'zod';
export declare const unitFloat: z.ZodNumber;
export declare const EntityFieldSchema: z.ZodObject<{
    name: z.ZodString;
    type: z.ZodEnum<["string", "number", "boolean", "date"]>;
    description: z.ZodString;
    required: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name: string;
    type: "string" | "number" | "boolean" | "date";
    description: string;
    required: boolean;
}, {
    name: string;
    type: "string" | "number" | "boolean" | "date";
    description: string;
    required?: boolean | undefined;
}>;
export type EntityField = z.infer<typeof EntityFieldSchema>;
export declare const DomainEntityTypeSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    fields: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodEnum<["string", "number", "boolean", "date"]>;
        description: z.ZodString;
        required: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        type: "string" | "number" | "boolean" | "date";
        description: string;
        required: boolean;
    }, {
        name: string;
        type: "string" | "number" | "boolean" | "date";
        description: string;
        required?: boolean | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    name: string;
    description: string;
    fields: {
        name: string;
        type: "string" | "number" | "boolean" | "date";
        description: string;
        required: boolean;
    }[];
}, {
    name: string;
    description: string;
    fields?: {
        name: string;
        type: "string" | "number" | "boolean" | "date";
        description: string;
        required?: boolean | undefined;
    }[] | undefined;
}>;
export type DomainEntityType = z.infer<typeof DomainEntityTypeSchema>;
export declare const DomainSchemaSchema: z.ZodObject<{
    entityTypes: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        description: z.ZodString;
        fields: z.ZodDefault<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodEnum<["string", "number", "boolean", "date"]>;
            description: z.ZodString;
            required: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            type: "string" | "number" | "boolean" | "date";
            description: string;
            required: boolean;
        }, {
            name: string;
            type: "string" | "number" | "boolean" | "date";
            description: string;
            required?: boolean | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        description: string;
        fields: {
            name: string;
            type: "string" | "number" | "boolean" | "date";
            description: string;
            required: boolean;
        }[];
    }, {
        name: string;
        description: string;
        fields?: {
            name: string;
            type: "string" | "number" | "boolean" | "date";
            description: string;
            required?: boolean | undefined;
        }[] | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    entityTypes: {
        name: string;
        description: string;
        fields: {
            name: string;
            type: "string" | "number" | "boolean" | "date";
            description: string;
            required: boolean;
        }[];
    }[];
}, {
    entityTypes?: {
        name: string;
        description: string;
        fields?: {
            name: string;
            type: "string" | "number" | "boolean" | "date";
            description: string;
            required?: boolean | undefined;
        }[] | undefined;
    }[] | undefined;
}>;
export type DomainSchema = z.infer<typeof DomainSchemaSchema>;
export declare const StenoConfigSchema: z.ZodObject<{
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
        temporal: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        vector: number;
        keyword: number;
        graph: number;
        recency: number;
        salience: number;
        temporal: number;
    }, {
        vector?: number | undefined;
        keyword?: number | undefined;
        graph?: number | undefined;
        recency?: number | undefined;
        salience?: number | undefined;
        temporal?: number | undefined;
    }>>;
    domainSchema: z.ZodOptional<z.ZodObject<{
        entityTypes: z.ZodDefault<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            description: z.ZodString;
            fields: z.ZodDefault<z.ZodArray<z.ZodObject<{
                name: z.ZodString;
                type: z.ZodEnum<["string", "number", "boolean", "date"]>;
                description: z.ZodString;
                required: z.ZodDefault<z.ZodBoolean>;
            }, "strip", z.ZodTypeAny, {
                name: string;
                type: "string" | "number" | "boolean" | "date";
                description: string;
                required: boolean;
            }, {
                name: string;
                type: "string" | "number" | "boolean" | "date";
                description: string;
                required?: boolean | undefined;
            }>, "many">>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            description: string;
            fields: {
                name: string;
                type: "string" | "number" | "boolean" | "date";
                description: string;
                required: boolean;
            }[];
        }, {
            name: string;
            description: string;
            fields?: {
                name: string;
                type: "string" | "number" | "boolean" | "date";
                description: string;
                required?: boolean | undefined;
            }[] | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        entityTypes: {
            name: string;
            description: string;
            fields: {
                name: string;
                type: "string" | "number" | "boolean" | "date";
                description: string;
                required: boolean;
            }[];
        }[];
    }, {
        entityTypes?: {
            name: string;
            description: string;
            fields?: {
                name: string;
                type: "string" | "number" | "boolean" | "date";
                description: string;
                required?: boolean | undefined;
            }[] | undefined;
        }[] | undefined;
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
        temporal: number;
    };
    domainSchema?: {
        entityTypes: {
            name: string;
            description: string;
            fields: {
                name: string;
                type: "string" | "number" | "boolean" | "date";
                description: string;
                required: boolean;
            }[];
        }[];
    } | undefined;
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
        temporal?: number | undefined;
    } | undefined;
    domainSchema?: {
        entityTypes?: {
            name: string;
            description: string;
            fields?: {
                name: string;
                type: "string" | "number" | "boolean" | "date";
                description: string;
                required?: boolean | undefined;
            }[] | undefined;
        }[] | undefined;
    } | undefined;
}>;
export type StenoConfig = z.infer<typeof StenoConfigSchema>;
export declare const SCOPES: readonly ["user", "agent", "session", "hive"];
export type Scope = (typeof SCOPES)[number];
export declare const SESSION_SCOPES: readonly ["user", "agent", "hive"];
export type SessionScope = (typeof SESSION_SCOPES)[number];
export declare const OPERATIONS: readonly ["create", "update", "invalidate"];
export type Operation = (typeof OPERATIONS)[number];
export declare const CONTRADICTION_STATUSES: readonly ["none", "active", "resolved", "superseded"];
export type ContradictionStatus = (typeof CONTRADICTION_STATUSES)[number];
export declare const SOURCE_TYPES: readonly ["conversation", "document", "url", "raw_text", "api", "agent_self"];
export type SourceType = (typeof SOURCE_TYPES)[number];
export declare const EXTRACTION_TIERS: readonly ["heuristic", "cheap_llm", "smart_llm"];
export type ExtractionTier = (typeof EXTRACTION_TIERS)[number];
export declare const EXTRACTION_TIERS_USED: readonly ["heuristic", "cheap_llm", "smart_llm", "multi_tier"];
export type ExtractionTierUsed = (typeof EXTRACTION_TIERS_USED)[number];
export declare const MODALITIES: readonly ["text", "image", "audio", "code", "document"];
export type Modality = (typeof MODALITIES)[number];
export declare const EDGE_TYPES: readonly ["associative", "causal", "temporal", "contradictory", "hierarchical", "updates", "extends", "derives"];
export type EdgeType = (typeof EDGE_TYPES)[number];
export declare const EXTRACTION_STATUSES: readonly ["queued", "processing", "completed", "failed", "deduped"];
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];
export declare const INPUT_TYPES: readonly ["conversation", "document", "url", "raw_text", "image", "audio", "code"];
export type InputType = (typeof INPUT_TYPES)[number];
export declare const PLANS: readonly ["free", "pro", "scale", "enterprise"];
export type Plan = (typeof PLANS)[number];
export declare const API_KEY_SCOPES: readonly ["read", "write", "admin"];
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];
export declare const FEEDBACK_TYPES: readonly ["implicit_positive", "implicit_negative", "explicit_positive", "explicit_negative", "correction"];
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];
export declare const ENTITY_ROLES: readonly ["subject", "object", "mentioned"];
export type EntityRole = (typeof ENTITY_ROLES)[number];
//# sourceMappingURL=config.d.ts.map
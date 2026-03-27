import { z } from 'zod';
// Shared Zod helpers
export const unitFloat = z.number().min(0).max(1);
// ---------------------------------------------------------------------------
// Domain-scoped graph schemas — custom entity types with typed attributes
// ---------------------------------------------------------------------------
export const EntityFieldSchema = z.object({
    name: z.string(),
    type: z.enum(['string', 'number', 'boolean', 'date']),
    description: z.string(),
    required: z.boolean().default(false),
});
export const DomainEntityTypeSchema = z.object({
    name: z.string(),
    description: z.string(),
    fields: z.array(EntityFieldSchema).default([]),
});
export const DomainSchemaSchema = z.object({
    entityTypes: z.array(DomainEntityTypeSchema).default([]),
});
// Steno engine configuration schema
export const StenoConfigSchema = z.object({
    embeddingModel: z.string().default('text-embedding-3-small'),
    embeddingDim: z.number().int().positive().default(1536),
    decayHalfLifeDays: z.number().positive().default(30),
    decayNormalizationK: z.number().positive().default(50),
    maxFactsPerScope: z.number().int().positive().default(10000),
    retrievalWeights: z
        .object({
        vector: z.number().min(0).max(1).default(0.35),
        keyword: z.number().min(0).max(1).default(0.15),
        graph: z.number().min(0).max(1).default(0.2),
        recency: z.number().min(0).max(1).default(0.15),
        salience: z.number().min(0).max(1).default(0.15),
        temporal: z.number().min(0).max(1).default(0.20),
    })
        .default({}),
    domainSchema: DomainSchemaSchema.optional(),
});
export const SCOPES = ['user', 'agent', 'session', 'hive'];
// SESSION_SCOPES is a subset of SCOPES — sessions themselves cannot be scoped to another session
export const SESSION_SCOPES = ['user', 'agent', 'hive'];
export const OPERATIONS = ['create', 'update', 'invalidate'];
export const CONTRADICTION_STATUSES = ['none', 'active', 'resolved', 'superseded'];
export const SOURCE_TYPES = [
    'conversation',
    'document',
    'url',
    'raw_text',
    'api',
    'agent_self',
];
export const EXTRACTION_TIERS = ['heuristic', 'cheap_llm', 'smart_llm'];
export const EXTRACTION_TIERS_USED = [...EXTRACTION_TIERS, 'multi_tier'];
export const MODALITIES = ['text', 'image', 'audio', 'code', 'document'];
export const EDGE_TYPES = [
    'associative',
    'causal',
    'temporal',
    'contradictory',
    'hierarchical',
    'updates', // new fact supersedes old one (knowledge chain)
    'extends', // new fact adds detail to old one
    'derives', // new fact is inferred from combining others
];
export const EXTRACTION_STATUSES = [
    'queued',
    'processing',
    'completed',
    'failed',
    'deduped',
];
export const INPUT_TYPES = [
    'conversation',
    'document',
    'url',
    'raw_text',
    'image',
    'audio',
    'code',
];
export const PLANS = ['free', 'pro', 'scale', 'enterprise'];
export const API_KEY_SCOPES = ['read', 'write', 'admin'];
export const FEEDBACK_TYPES = [
    'implicit_positive',
    'implicit_negative',
    'explicit_positive',
    'explicit_negative',
    'correction',
];
export const ENTITY_ROLES = ['subject', 'object', 'mentioned'];
//# sourceMappingURL=config.js.map
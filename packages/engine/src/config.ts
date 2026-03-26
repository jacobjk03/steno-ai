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
export type EntityField = z.infer<typeof EntityFieldSchema>;

export const DomainEntityTypeSchema = z.object({
  name: z.string(),
  description: z.string(),
  fields: z.array(EntityFieldSchema).default([]),
});
export type DomainEntityType = z.infer<typeof DomainEntityTypeSchema>;

export const DomainSchemaSchema = z.object({
  entityTypes: z.array(DomainEntityTypeSchema).default([]),
});
export type DomainSchema = z.infer<typeof DomainSchemaSchema>;

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
export type StenoConfig = z.infer<typeof StenoConfigSchema>;

export const SCOPES = ['user', 'agent', 'session', 'hive'] as const;
export type Scope = (typeof SCOPES)[number];

// SESSION_SCOPES is a subset of SCOPES — sessions themselves cannot be scoped to another session
export const SESSION_SCOPES = ['user', 'agent', 'hive'] as const;
export type SessionScope = (typeof SESSION_SCOPES)[number];

export const OPERATIONS = ['create', 'update', 'invalidate'] as const;
export type Operation = (typeof OPERATIONS)[number];

export const CONTRADICTION_STATUSES = ['none', 'active', 'resolved', 'superseded'] as const;
export type ContradictionStatus = (typeof CONTRADICTION_STATUSES)[number];

export const SOURCE_TYPES = [
  'conversation',
  'document',
  'url',
  'raw_text',
  'api',
  'agent_self',
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const EXTRACTION_TIERS = ['heuristic', 'cheap_llm', 'smart_llm'] as const;
export type ExtractionTier = (typeof EXTRACTION_TIERS)[number];

export const EXTRACTION_TIERS_USED = [...EXTRACTION_TIERS, 'multi_tier'] as const;
export type ExtractionTierUsed = (typeof EXTRACTION_TIERS_USED)[number];

export const MODALITIES = ['text', 'image', 'audio', 'code', 'document'] as const;
export type Modality = (typeof MODALITIES)[number];

export const EDGE_TYPES = [
  'associative',
  'causal',
  'temporal',
  'contradictory',
  'hierarchical',
  'updates',    // new fact supersedes old one (knowledge chain)
  'extends',    // new fact adds detail to old one
  'derives',    // new fact is inferred from combining others
] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

export const EXTRACTION_STATUSES = [
  'queued',
  'processing',
  'completed',
  'failed',
  'deduped',
] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

export const INPUT_TYPES = [
  'conversation',
  'document',
  'url',
  'raw_text',
  'image',
  'audio',
  'code',
] as const;
export type InputType = (typeof INPUT_TYPES)[number];

export const PLANS = ['free', 'pro', 'scale', 'enterprise'] as const;
export type Plan = (typeof PLANS)[number];

export const API_KEY_SCOPES = ['read', 'write', 'admin'] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const FEEDBACK_TYPES = [
  'implicit_positive',
  'implicit_negative',
  'explicit_positive',
  'explicit_negative',
  'correction',
] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const ENTITY_ROLES = ['subject', 'object', 'mentioned'] as const;
export type EntityRole = (typeof ENTITY_ROLES)[number];

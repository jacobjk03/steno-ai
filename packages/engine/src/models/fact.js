import { z } from 'zod';
import { unitFloat, SCOPES, OPERATIONS, CONTRADICTION_STATUSES, SOURCE_TYPES, EXTRACTION_TIERS, MODALITIES, } from '../config.js';
export const FactSchema = z.object({
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    scope: z.enum(SCOPES),
    scopeId: z.string().min(1),
    sessionId: z.string().uuid().nullable(),
    content: z.string().min(1).max(50000),
    // embeddingModel and embeddingDim are nullable because facts can be created
    // before their embeddings are computed (spec deviation: pragmatic)
    embeddingModel: z.string().nullable(),
    embeddingDim: z.number().int().positive().nullable(),
    version: z.number().int().positive(),
    lineageId: z.string().uuid(),
    validFrom: z.coerce.date(),
    validUntil: z.coerce.date().nullable(),
    operation: z.enum(OPERATIONS),
    parentId: z.string().uuid().nullable(),
    importance: unitFloat,
    frequency: z.number().int().nonnegative(),
    lastAccessed: z.coerce.date().nullable(),
    decayScore: unitFloat,
    contradictionStatus: z.enum(CONTRADICTION_STATUSES),
    contradictsId: z.string().uuid().nullable(),
    sourceType: z.enum(SOURCE_TYPES),
    sourceRef: z.record(z.unknown()).nullable(),
    confidence: unitFloat,
    originalContent: z.string().nullable(),
    extractionId: z.string().uuid().nullable(),
    extractionTier: z.enum(EXTRACTION_TIERS).nullable(),
    modality: z.enum(MODALITIES),
    tags: z.array(z.string().max(100)).max(20),
    metadata: z.record(z.string(), z.unknown()),
    /** When the event described in the fact actually occurred */
    eventDate: z.coerce.date().nullable().optional(),
    /** When the conversation/document was authored */
    documentDate: z.coerce.date().nullable().optional(),
    /** The original conversation chunk this fact was extracted from */
    sourceChunk: z.string().max(10000).nullable().optional().default(null),
    createdAt: z.coerce.date(),
});
export const CreateFactSchema = z.object({
    tenantId: z.string().uuid(),
    scope: z.enum(SCOPES),
    scopeId: z.string().min(1),
    sessionId: z.string().uuid().optional(),
    content: z.string().min(1).max(50000),
    embeddingModel: z.string().optional(),
    embeddingDim: z.number().int().positive().optional(),
    lineageId: z.string().uuid().optional(),
    parentId: z.string().uuid().optional(),
    importance: unitFloat.default(0.5),
    confidence: unitFloat.default(0.8),
    operation: z.enum(OPERATIONS).default('create'),
    contradictionStatus: z.enum(CONTRADICTION_STATUSES).default('none'),
    contradictsId: z.string().uuid().optional(),
    sourceType: z.enum(SOURCE_TYPES).optional(),
    sourceRef: z.record(z.unknown()).optional(),
    originalContent: z.string().optional(),
    extractionId: z.string().uuid().optional(),
    extractionTier: z.enum(EXTRACTION_TIERS).optional(),
    modality: z.enum(MODALITIES).default('text'),
    tags: z.array(z.string().max(100)).max(20).default([]),
    metadata: z.record(z.string(), z.unknown()).default({}),
    sourceChunk: z.string().max(10000).optional(),
    /** When the event described in the fact actually occurred */
    eventDate: z.coerce.date().optional(),
    /** When the conversation/document was authored */
    documentDate: z.coerce.date().optional(),
});
//# sourceMappingURL=fact.js.map
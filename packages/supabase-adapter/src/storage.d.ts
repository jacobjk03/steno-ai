import type { SupabaseClient } from '@supabase/supabase-js';
import type { StorageAdapter, PaginationOptions, PaginatedResult, VectorSearchOptions, VectorSearchResult, KeywordSearchOptions, KeywordSearchResult, CompoundSearchOptions, CompoundSearchResult, GraphTraversalOptions, GraphTraversalResult } from '@steno-ai/engine';
import type { Fact, CreateFact, Entity, CreateEntity, Edge, CreateEdge, Trigger, CreateTrigger, MemoryAccess, CreateMemoryAccess, Extraction, CreateExtraction, Session, CreateSession, Tenant, CreateTenant, ApiKey, CreateApiKey, UsageRecord, Webhook, CreateWebhook } from '@steno-ai/engine';
/**
 * Convert all top-level keys of a plain object from camelCase to snake_case.
 * Nested objects (metadata, config, properties, condition) are preserved as-is.
 * Arrays and null values are preserved.
 */
export declare function toSnakeCase(obj: Record<string, unknown>): Record<string, unknown>;
/**
 * Convert all top-level keys of a plain object from snake_case to camelCase.
 * Nested objects (metadata, config, properties, condition) are preserved as-is.
 * Arrays and null values are preserved.
 */
export declare function toCamelCase(obj: Record<string, unknown>): Record<string, unknown>;
export declare class SupabaseStorageAdapter implements StorageAdapter {
    private client;
    constructor(client: SupabaseClient);
    ping(): Promise<boolean>;
    createTenant(tenant: CreateTenant & {
        id: string;
    }): Promise<Tenant>;
    getTenant(id: string): Promise<Tenant | null>;
    getTenantBySlug(slug: string): Promise<Tenant | null>;
    updateTenant(id: string, updates: Partial<Tenant>): Promise<Tenant>;
    createApiKey(apiKey: CreateApiKey & {
        id: string;
        keyHash: string;
        keyPrefix: string;
    }): Promise<ApiKey>;
    getApiKeyByPrefix(prefix: string): Promise<ApiKey | null>;
    getApiKeysForTenant(tenantId: string): Promise<ApiKey[]>;
    revokeApiKey(tenantId: string, id: string): Promise<void>;
    updateApiKeyLastUsed(id: string): Promise<void>;
    createExtraction(extraction: CreateExtraction & {
        id: string;
    }): Promise<Extraction>;
    getExtraction(tenantId: string, id: string): Promise<Extraction | null>;
    updateExtraction(tenantId: string, id: string, updates: Partial<Extraction>): Promise<Extraction>;
    getExtractionByHash(tenantId: string, inputHash: string): Promise<Extraction | null>;
    getExtractionsByTenant(tenantId: string, options: PaginationOptions): Promise<PaginatedResult<Extraction>>;
    createFact(fact: CreateFact & {
        id: string;
        lineageId: string;
        embeddingModel: string;
        embeddingDim: number;
        embedding?: number[];
    }): Promise<Fact>;
    getFact(tenantId: string, id: string): Promise<Fact | null>;
    getFactsByIds(tenantId: string, ids: string[]): Promise<Fact[]>;
    getFactsByLineage(tenantId: string, lineageId: string): Promise<Fact[]>;
    invalidateFact(tenantId: string, id: string): Promise<void>;
    createEntity(entity: CreateEntity & {
        id: string;
        embedding?: number[];
        embeddingModel?: string;
        embeddingDim?: number;
    }): Promise<Entity>;
    getEntity(tenantId: string, id: string): Promise<Entity | null>;
    findEntityByCanonicalName(tenantId: string, canonicalName: string, entityType: string): Promise<Entity | null>;
    findEntitiesByEmbedding(tenantId: string, embedding: number[], limit: number, minSimilarity?: number): Promise<Array<{
        entity: Entity;
        similarity: number;
    }>>;
    linkFactEntity(factId: string, entityId: string, role: string): Promise<void>;
    createEdge(edge: CreateEdge & {
        id: string;
    }): Promise<Edge>;
    vectorSearch(options: VectorSearchOptions): Promise<VectorSearchResult[]>;
    incrementUsage(tenantId: string, tokens: number, queries: number, extractions: number, costUsd: number): Promise<void>;
    getUsage(tenantId: string, periodStart: Date): Promise<UsageRecord | null>;
    getCurrentUsage(tenantId: string): Promise<UsageRecord | null>;
    getFactsByScope(tenantId: string, scope: string, scopeId: string, options: PaginationOptions): Promise<PaginatedResult<Fact>>;
    purgeFacts(tenantId: string, scope: string, scopeId: string): Promise<number>;
    updateDecayScores(tenantId: string, facts: Array<{
        id: string;
        decayScore: number;
        lastAccessed?: Date;
        frequency?: number;
        importance?: number;
    }>): Promise<void>;
    keywordSearch(options: KeywordSearchOptions): Promise<KeywordSearchResult[]>;
    compoundSearch(options: CompoundSearchOptions): Promise<CompoundSearchResult[]>;
    getEntitiesForTenant(tenantId: string, options: PaginationOptions): Promise<PaginatedResult<Entity>>;
    getEntitiesForFact(factId: string): Promise<Entity[]>;
    getFactsForEntity(tenantId: string, entityId: string, options: PaginationOptions): Promise<PaginatedResult<Fact>>;
    getFactsForEntities(tenantId: string, entityIds: string[], perEntityLimit: number): Promise<Array<{
        entityId: string;
        fact: Fact;
    }>>;
    getEdgesForEntity(tenantId: string, entityId: string): Promise<Edge[]>;
    graphTraversal(options: GraphTraversalOptions): Promise<GraphTraversalResult>;
    createTrigger(trigger: CreateTrigger & {
        id: string;
    }): Promise<Trigger>;
    getTrigger(tenantId: string, id: string): Promise<Trigger | null>;
    getActiveTriggers(tenantId: string, scope: string, scopeId: string): Promise<Trigger[]>;
    updateTrigger(tenantId: string, id: string, updates: Partial<Trigger>): Promise<Trigger>;
    deleteTrigger(tenantId: string, id: string): Promise<void>;
    incrementTriggerFired(tenantId: string, id: string): Promise<void>;
    createMemoryAccess(access: CreateMemoryAccess & {
        id: string;
    }): Promise<MemoryAccess>;
    updateFeedback(tenantId: string, factId: string, feedback: {
        wasUseful: boolean;
        feedbackType: string;
        feedbackDetail?: string;
        wasCorrected?: boolean;
    }): Promise<void>;
    createSession(session: CreateSession & {
        id: string;
    }): Promise<Session>;
    getSession(tenantId: string, id: string): Promise<Session | null>;
    endSession(tenantId: string, id: string, summary?: string, topics?: string[]): Promise<Session>;
    getSessionsByScope(tenantId: string, scope: string, scopeId: string, options: PaginationOptions): Promise<PaginatedResult<Session>>;
    createWebhook(webhook: CreateWebhook & {
        id: string;
        secretHash: string;
        signingKey: string;
    }): Promise<Webhook>;
    getWebhook(tenantId: string, id: string): Promise<Webhook | null>;
    getWebhooksForTenant(tenantId: string): Promise<Webhook[]>;
    getWebhooksByEvent(tenantId: string, event: string): Promise<Webhook[]>;
    deleteWebhook(tenantId: string, id: string): Promise<void>;
}
//# sourceMappingURL=storage.d.ts.map
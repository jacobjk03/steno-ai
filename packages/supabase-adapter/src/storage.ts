import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  StorageAdapter,
  PaginationOptions,
  PaginatedResult,
  VectorSearchOptions,
  VectorSearchResult,
  KeywordSearchOptions,
  GraphTraversalOptions,
  GraphTraversalResult,
} from '@steno-ai/engine';
import type {
  Fact,
  CreateFact,
  Entity,
  CreateEntity,
  Edge,
  CreateEdge,
  Trigger,
  CreateTrigger,
  MemoryAccess,
  CreateMemoryAccess,
  Extraction,
  CreateExtraction,
  Session,
  CreateSession,
  Tenant,
  CreateTenant,
  ApiKey,
  CreateApiKey,
  UsageRecord,
} from '@steno-ai/engine';

export class SupabaseStorageAdapter implements StorageAdapter {
  constructor(private client: SupabaseClient) {}

  async ping(): Promise<boolean> {
    const { error } = await this.client.from('tenants').select('id').limit(1);
    return !error;
  }

  // Facts

  async createFact(
    _fact: CreateFact & { id: string; lineageId: string; embeddingModel: string; embeddingDim: number; embedding?: number[] },
  ): Promise<Fact> {
    throw new Error('SupabaseStorageAdapter.createFact() not yet implemented. Coming in Plan 2.');
  }

  async getFact(_tenantId: string, _id: string): Promise<Fact | null> {
    throw new Error('SupabaseStorageAdapter.getFact() not yet implemented. Coming in Plan 2.');
  }

  async getFactsByLineage(_tenantId: string, _lineageId: string): Promise<Fact[]> {
    throw new Error('SupabaseStorageAdapter.getFactsByLineage() not yet implemented. Coming in Plan 2.');
  }

  async getFactsByScope(
    _tenantId: string,
    _scope: string,
    _scopeId: string,
    _options: PaginationOptions,
  ): Promise<PaginatedResult<Fact>> {
    throw new Error('SupabaseStorageAdapter.getFactsByScope() not yet implemented. Coming in Plan 2.');
  }

  async invalidateFact(_tenantId: string, _id: string): Promise<void> {
    throw new Error('SupabaseStorageAdapter.invalidateFact() not yet implemented. Coming in Plan 2.');
  }

  async purgeFacts(_tenantId: string, _scope: string, _scopeId: string): Promise<number> {
    throw new Error('SupabaseStorageAdapter.purgeFacts() not yet implemented. Coming in Plan 2.');
  }

  async updateDecayScores(
    _tenantId: string,
    _facts: Array<{ id: string; decayScore: number }>,
  ): Promise<void> {
    throw new Error('SupabaseStorageAdapter.updateDecayScores() not yet implemented. Coming in Plan 2.');
  }

  // Vector search

  async vectorSearch(_options: VectorSearchOptions): Promise<VectorSearchResult[]> {
    throw new Error('SupabaseStorageAdapter.vectorSearch() not yet implemented. Coming in Plan 2.');
  }

  // Keyword search

  async keywordSearch(_options: KeywordSearchOptions): Promise<Fact[]> {
    throw new Error('SupabaseStorageAdapter.keywordSearch() not yet implemented. Coming in Plan 2.');
  }

  // Entities

  async createEntity(
    _entity: CreateEntity & { id: string; embedding?: number[]; embeddingModel?: string; embeddingDim?: number },
  ): Promise<Entity> {
    throw new Error('SupabaseStorageAdapter.createEntity() not yet implemented. Coming in Plan 2.');
  }

  async getEntity(_tenantId: string, _id: string): Promise<Entity | null> {
    throw new Error('SupabaseStorageAdapter.getEntity() not yet implemented. Coming in Plan 2.');
  }

  async findEntityByCanonicalName(
    _tenantId: string,
    _canonicalName: string,
    _entityType: string,
  ): Promise<Entity | null> {
    throw new Error('SupabaseStorageAdapter.findEntityByCanonicalName() not yet implemented. Coming in Plan 2.');
  }

  async getEntitiesForTenant(
    _tenantId: string,
    _options: PaginationOptions,
  ): Promise<PaginatedResult<Entity>> {
    throw new Error('SupabaseStorageAdapter.getEntitiesForTenant() not yet implemented. Coming in Plan 2.');
  }

  // Fact-Entity junction

  async linkFactEntity(_factId: string, _entityId: string, _role: string): Promise<void> {
    throw new Error('SupabaseStorageAdapter.linkFactEntity() not yet implemented. Coming in Plan 2.');
  }

  async getEntitiesForFact(_factId: string): Promise<Entity[]> {
    throw new Error('SupabaseStorageAdapter.getEntitiesForFact() not yet implemented. Coming in Plan 2.');
  }

  async getFactsForEntity(
    _tenantId: string,
    _entityId: string,
    _options: PaginationOptions,
  ): Promise<PaginatedResult<Fact>> {
    throw new Error('SupabaseStorageAdapter.getFactsForEntity() not yet implemented. Coming in Plan 2.');
  }

  // Edges

  async createEdge(_edge: CreateEdge & { id: string }): Promise<Edge> {
    throw new Error('SupabaseStorageAdapter.createEdge() not yet implemented. Coming in Plan 2.');
  }

  async getEdgesForEntity(_tenantId: string, _entityId: string): Promise<Edge[]> {
    throw new Error('SupabaseStorageAdapter.getEdgesForEntity() not yet implemented. Coming in Plan 2.');
  }

  async graphTraversal(_options: GraphTraversalOptions): Promise<GraphTraversalResult> {
    throw new Error('SupabaseStorageAdapter.graphTraversal() not yet implemented. Coming in Plan 2.');
  }

  // Triggers

  async createTrigger(_trigger: CreateTrigger & { id: string }): Promise<Trigger> {
    throw new Error('SupabaseStorageAdapter.createTrigger() not yet implemented. Coming in Plan 2.');
  }

  async getTrigger(_tenantId: string, _id: string): Promise<Trigger | null> {
    throw new Error('SupabaseStorageAdapter.getTrigger() not yet implemented. Coming in Plan 2.');
  }

  async getActiveTriggers(_tenantId: string, _scope: string, _scopeId: string): Promise<Trigger[]> {
    throw new Error('SupabaseStorageAdapter.getActiveTriggers() not yet implemented. Coming in Plan 2.');
  }

  async updateTrigger(
    _tenantId: string,
    _id: string,
    _updates: Partial<Trigger>,
  ): Promise<Trigger> {
    throw new Error('SupabaseStorageAdapter.updateTrigger() not yet implemented. Coming in Plan 2.');
  }

  async deleteTrigger(_tenantId: string, _id: string): Promise<void> {
    throw new Error('SupabaseStorageAdapter.deleteTrigger() not yet implemented. Coming in Plan 2.');
  }

  async incrementTriggerFired(_tenantId: string, _id: string): Promise<void> {
    throw new Error('SupabaseStorageAdapter.incrementTriggerFired() not yet implemented. Coming in Plan 2.');
  }

  // Memory Access (metamemory)

  async createMemoryAccess(
    _access: CreateMemoryAccess & { id: string },
  ): Promise<MemoryAccess> {
    throw new Error('SupabaseStorageAdapter.createMemoryAccess() not yet implemented. Coming in Plan 2.');
  }

  async updateFeedback(
    _tenantId: string,
    _factId: string,
    _feedback: { wasUseful: boolean; feedbackType: string; feedbackDetail?: string },
  ): Promise<void> {
    throw new Error('SupabaseStorageAdapter.updateFeedback() not yet implemented. Coming in Plan 2.');
  }

  // Extractions

  async createExtraction(_extraction: CreateExtraction & { id: string }): Promise<Extraction> {
    throw new Error('SupabaseStorageAdapter.createExtraction() not yet implemented. Coming in Plan 2.');
  }

  async getExtraction(_tenantId: string, _id: string): Promise<Extraction | null> {
    throw new Error('SupabaseStorageAdapter.getExtraction() not yet implemented. Coming in Plan 2.');
  }

  async updateExtraction(
    _tenantId: string,
    _id: string,
    _updates: Partial<Extraction>,
  ): Promise<Extraction> {
    throw new Error('SupabaseStorageAdapter.updateExtraction() not yet implemented. Coming in Plan 2.');
  }

  async getExtractionByHash(_tenantId: string, _inputHash: string): Promise<Extraction | null> {
    throw new Error('SupabaseStorageAdapter.getExtractionByHash() not yet implemented. Coming in Plan 2.');
  }

  // Sessions

  async createSession(_session: CreateSession & { id: string }): Promise<Session> {
    throw new Error('SupabaseStorageAdapter.createSession() not yet implemented. Coming in Plan 2.');
  }

  async getSession(_tenantId: string, _id: string): Promise<Session | null> {
    throw new Error('SupabaseStorageAdapter.getSession() not yet implemented. Coming in Plan 2.');
  }

  async endSession(
    _tenantId: string,
    _id: string,
    _summary?: string,
    _topics?: string[],
  ): Promise<Session> {
    throw new Error('SupabaseStorageAdapter.endSession() not yet implemented. Coming in Plan 2.');
  }

  async getSessionsByScope(
    _tenantId: string,
    _scope: string,
    _scopeId: string,
    _options: PaginationOptions,
  ): Promise<PaginatedResult<Session>> {
    throw new Error('SupabaseStorageAdapter.getSessionsByScope() not yet implemented. Coming in Plan 2.');
  }

  // Tenants

  async createTenant(_tenant: CreateTenant & { id: string }): Promise<Tenant> {
    throw new Error('SupabaseStorageAdapter.createTenant() not yet implemented. Coming in Plan 2.');
  }

  async getTenant(_id: string): Promise<Tenant | null> {
    throw new Error('SupabaseStorageAdapter.getTenant() not yet implemented. Coming in Plan 2.');
  }

  async getTenantBySlug(_slug: string): Promise<Tenant | null> {
    throw new Error('SupabaseStorageAdapter.getTenantBySlug() not yet implemented. Coming in Plan 2.');
  }

  async updateTenant(_id: string, _updates: Partial<Tenant>): Promise<Tenant> {
    throw new Error('SupabaseStorageAdapter.updateTenant() not yet implemented. Coming in Plan 2.');
  }

  // API Keys

  async createApiKey(
    _apiKey: CreateApiKey & { id: string; keyHash: string; keyPrefix: string },
  ): Promise<ApiKey> {
    throw new Error('SupabaseStorageAdapter.createApiKey() not yet implemented. Coming in Plan 2.');
  }

  async getApiKeyByPrefix(_prefix: string): Promise<ApiKey | null> {
    throw new Error('SupabaseStorageAdapter.getApiKeyByPrefix() not yet implemented. Coming in Plan 2.');
  }

  async getApiKeysForTenant(_tenantId: string): Promise<ApiKey[]> {
    throw new Error('SupabaseStorageAdapter.getApiKeysForTenant() not yet implemented. Coming in Plan 2.');
  }

  async revokeApiKey(_tenantId: string, _id: string): Promise<void> {
    throw new Error('SupabaseStorageAdapter.revokeApiKey() not yet implemented. Coming in Plan 2.');
  }

  async updateApiKeyLastUsed(_id: string): Promise<void> {
    throw new Error('SupabaseStorageAdapter.updateApiKeyLastUsed() not yet implemented. Coming in Plan 2.');
  }

  // Usage

  async incrementUsage(
    _tenantId: string,
    _tokens: number,
    _queries: number,
    _extractions: number,
    _costUsd: number,
  ): Promise<void> {
    throw new Error('SupabaseStorageAdapter.incrementUsage() not yet implemented. Coming in Plan 2.');
  }

  async getUsage(_tenantId: string, _periodStart: Date): Promise<UsageRecord | null> {
    throw new Error('SupabaseStorageAdapter.getUsage() not yet implemented. Coming in Plan 2.');
  }

  async getCurrentUsage(_tenantId: string): Promise<UsageRecord | null> {
    throw new Error('SupabaseStorageAdapter.getCurrentUsage() not yet implemented. Coming in Plan 2.');
  }
}

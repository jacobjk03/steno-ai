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

// =============================================================================
// camelCase ↔ snake_case conversion utilities
// =============================================================================

/**
 * Convert a single camelCase key to snake_case.
 * e.g. tenantId → tenant_id, validFrom → valid_from
 */
function camelToSnake(key: string): string {
  return key.replace(/([A-Z])/g, (match) => `_${match.toLowerCase()}`);
}

/**
 * Convert a single snake_case key to camelCase.
 * e.g. tenant_id → tenantId, valid_from → validFrom
 */
function snakeToCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
}

/**
 * Convert all top-level keys of a plain object from camelCase to snake_case.
 * Nested objects (metadata, config, properties, condition) are preserved as-is.
 * Arrays and null values are preserved.
 */
export function toSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[camelToSnake(key)] = value;
  }
  return result;
}

/**
 * Convert all top-level keys of a plain object from snake_case to camelCase.
 * Nested objects (metadata, config, properties, condition) are preserved as-is.
 * Arrays and null values are preserved.
 */
export function toCamelCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[snakeToCamel(key)] = value;
  }
  return result;
}

// =============================================================================
// Error helpers
// =============================================================================

function throwSupabaseError(method: string, error: { message: string } | null): never {
  throw new Error(`SupabaseStorageAdapter.${method}() failed: ${error?.message ?? 'unknown error'}`);
}

// =============================================================================
// SupabaseStorageAdapter
// =============================================================================

export class SupabaseStorageAdapter implements StorageAdapter {
  constructor(private client: SupabaseClient) {}

  async ping(): Promise<boolean> {
    const { error } = await this.client.from('tenants').select('id').limit(1);
    return !error;
  }

  // ---------------------------------------------------------------------------
  // Tenants
  // ---------------------------------------------------------------------------

  async createTenant(tenant: CreateTenant & { id: string }): Promise<Tenant> {
    const row = toSnakeCase(tenant as unknown as Record<string, unknown>);
    const { data, error } = await this.client
      .from('tenants')
      .insert(row)
      .select()
      .single();
    if (error) throwSupabaseError('createTenant', error);
    return toCamelCase(data as Record<string, unknown>) as unknown as Tenant;
  }

  async getTenant(id: string): Promise<Tenant | null> {
    const { data, error } = await this.client
      .from('tenants')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throwSupabaseError('getTenant', error);
    if (!data) return null;
    return toCamelCase(data as Record<string, unknown>) as unknown as Tenant;
  }

  async getTenantBySlug(slug: string): Promise<Tenant | null> {
    const { data, error } = await this.client
      .from('tenants')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    if (error) throwSupabaseError('getTenantBySlug', error);
    if (!data) return null;
    return toCamelCase(data as Record<string, unknown>) as unknown as Tenant;
  }

  async updateTenant(id: string, updates: Partial<Tenant>): Promise<Tenant> {
    const row = toSnakeCase(updates as unknown as Record<string, unknown>);
    const { data, error } = await this.client
      .from('tenants')
      .update(row)
      .eq('id', id)
      .select()
      .single();
    if (error) throwSupabaseError('updateTenant', error);
    return toCamelCase(data as Record<string, unknown>) as unknown as Tenant;
  }

  // ---------------------------------------------------------------------------
  // API Keys
  // ---------------------------------------------------------------------------

  async createApiKey(
    apiKey: CreateApiKey & { id: string; keyHash: string; keyPrefix: string },
  ): Promise<ApiKey> {
    const row = toSnakeCase(apiKey as unknown as Record<string, unknown>);
    const { data, error } = await this.client
      .from('api_keys')
      .insert(row)
      .select()
      .single();
    if (error) throwSupabaseError('createApiKey', error);
    return toCamelCase(data as Record<string, unknown>) as unknown as ApiKey;
  }

  async getApiKeyByPrefix(prefix: string): Promise<ApiKey | null> {
    const { data, error } = await this.client
      .from('api_keys')
      .select('*')
      .eq('key_prefix', prefix)
      .eq('active', true)
      .maybeSingle();
    if (error) throwSupabaseError('getApiKeyByPrefix', error);
    if (!data) return null;
    return toCamelCase(data as Record<string, unknown>) as unknown as ApiKey;
  }

  async getApiKeysForTenant(tenantId: string): Promise<ApiKey[]> {
    const { data, error } = await this.client
      .from('api_keys')
      .select('*')
      .eq('tenant_id', tenantId);
    if (error) throwSupabaseError('getApiKeysForTenant', error);
    return (data ?? []).map(
      (row) => toCamelCase(row as Record<string, unknown>) as unknown as ApiKey,
    );
  }

  async revokeApiKey(tenantId: string, id: string): Promise<void> {
    const { error } = await this.client
      .from('api_keys')
      .update({ active: false })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) throwSupabaseError('revokeApiKey', error);
  }

  async updateApiKeyLastUsed(id: string): Promise<void> {
    const { error } = await this.client
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throwSupabaseError('updateApiKeyLastUsed', error);
  }

  // ---------------------------------------------------------------------------
  // Extractions
  // ---------------------------------------------------------------------------

  async createExtraction(extraction: CreateExtraction & { id: string }): Promise<Extraction> {
    const row = toSnakeCase({
      ...(extraction as unknown as Record<string, unknown>),
      status: 'queued',
    });
    const { data, error } = await this.client
      .from('extractions')
      .insert(row)
      .select()
      .single();
    if (error) throwSupabaseError('createExtraction', error);
    return toCamelCase(data as Record<string, unknown>) as unknown as Extraction;
  }

  async getExtraction(tenantId: string, id: string): Promise<Extraction | null> {
    const { data, error } = await this.client
      .from('extractions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    if (error) throwSupabaseError('getExtraction', error);
    if (!data) return null;
    return toCamelCase(data as Record<string, unknown>) as unknown as Extraction;
  }

  async updateExtraction(
    tenantId: string,
    id: string,
    updates: Partial<Extraction>,
  ): Promise<Extraction> {
    const row = toSnakeCase(updates as unknown as Record<string, unknown>);
    const { data, error } = await this.client
      .from('extractions')
      .update(row)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select()
      .single();
    if (error) throwSupabaseError('updateExtraction', error);
    return toCamelCase(data as Record<string, unknown>) as unknown as Extraction;
  }

  async getExtractionByHash(tenantId: string, inputHash: string): Promise<Extraction | null> {
    const { data, error } = await this.client
      .from('extractions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('input_hash', inputHash)
      .maybeSingle();
    if (error) throwSupabaseError('getExtractionByHash', error);
    if (!data) return null;
    return toCamelCase(data as Record<string, unknown>) as unknown as Extraction;
  }

  // ---------------------------------------------------------------------------
  // Facts
  // ---------------------------------------------------------------------------

  async createFact(
    fact: CreateFact & {
      id: string;
      lineageId: string;
      embeddingModel: string;
      embeddingDim: number;
      embedding?: number[];
    },
  ): Promise<Fact> {
    const { embedding, ...rest } = fact;
    const row = toSnakeCase(rest as unknown as Record<string, unknown>);

    // Version defaults to 1 for new facts
    if (!('version' in row)) {
      row['version'] = 1;
    }

    // Lineage ID is required; the interface guarantees it, but set it explicitly
    if (!row['lineage_id']) {
      row['lineage_id'] = fact.id; // fallback: use fact id as its own lineage
    }

    // Embeddings need special handling — pgvector expects a string like '[0.1,0.2,...]'
    if (embedding !== undefined) {
      row['embedding'] = `[${embedding.join(',')}]`;
    }

    const { data, error } = await this.client
      .from('facts')
      .insert(row)
      .select()
      .single();
    if (error) throwSupabaseError('createFact', error);
    return toCamelCase(data as Record<string, unknown>) as unknown as Fact;
  }

  async getFact(tenantId: string, id: string): Promise<Fact | null> {
    const { data, error } = await this.client
      .from('facts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    if (error) throwSupabaseError('getFact', error);
    if (!data) return null;
    return toCamelCase(data as Record<string, unknown>) as unknown as Fact;
  }

  async getFactsByLineage(tenantId: string, lineageId: string): Promise<Fact[]> {
    const { data, error } = await this.client
      .from('facts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('lineage_id', lineageId)
      .order('version', { ascending: true });
    if (error) throwSupabaseError('getFactsByLineage', error);
    return (data ?? []).map(
      (row) => toCamelCase(row as Record<string, unknown>) as unknown as Fact,
    );
  }

  async invalidateFact(tenantId: string, id: string): Promise<void> {
    const { error } = await this.client
      .from('facts')
      .update({ valid_until: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('id', id);
    if (error) throwSupabaseError('invalidateFact', error);
  }

  // ---------------------------------------------------------------------------
  // Entities
  // ---------------------------------------------------------------------------

  async createEntity(
    entity: CreateEntity & {
      id: string;
      embedding?: number[];
      embeddingModel?: string;
      embeddingDim?: number;
    },
  ): Promise<Entity> {
    const { embedding, ...rest } = entity;
    const row = toSnakeCase(rest as unknown as Record<string, unknown>);

    if (embedding !== undefined) {
      row['embedding'] = `[${embedding.join(',')}]`;
    }

    const { data, error } = await this.client
      .from('entities')
      .insert(row)
      .select()
      .single();
    if (error) throwSupabaseError('createEntity', error);
    return toCamelCase(data as Record<string, unknown>) as unknown as Entity;
  }

  async getEntity(tenantId: string, id: string): Promise<Entity | null> {
    const { data, error } = await this.client
      .from('entities')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    if (error) throwSupabaseError('getEntity', error);
    if (!data) return null;
    return toCamelCase(data as Record<string, unknown>) as unknown as Entity;
  }

  async findEntityByCanonicalName(
    tenantId: string,
    canonicalName: string,
    entityType: string,
  ): Promise<Entity | null> {
    const { data, error } = await this.client
      .from('entities')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('canonical_name', canonicalName)
      .eq('entity_type', entityType)
      .maybeSingle();
    if (error) throwSupabaseError('findEntityByCanonicalName', error);
    if (!data) return null;
    return toCamelCase(data as Record<string, unknown>) as unknown as Entity;
  }

  // ---------------------------------------------------------------------------
  // Fact-Entity junction
  // ---------------------------------------------------------------------------

  async linkFactEntity(factId: string, entityId: string, role: string): Promise<void> {
    const { error } = await this.client.from('fact_entities').insert({
      fact_id: factId,
      entity_id: entityId,
      role,
    });
    if (error) throwSupabaseError('linkFactEntity', error);
  }

  // ---------------------------------------------------------------------------
  // Edges
  // ---------------------------------------------------------------------------

  async createEdge(edge: CreateEdge & { id: string }): Promise<Edge> {
    const row = toSnakeCase(edge as unknown as Record<string, unknown>);
    const { data, error } = await this.client
      .from('edges')
      .insert(row)
      .select()
      .single();
    if (error) throwSupabaseError('createEdge', error);
    return toCamelCase(data as Record<string, unknown>) as unknown as Edge;
  }

  // ---------------------------------------------------------------------------
  // Vector search
  // ---------------------------------------------------------------------------

  async vectorSearch(options: VectorSearchOptions): Promise<VectorSearchResult[]> {
    const { embedding, tenantId, scope, scopeId, limit, minSimilarity } = options;

    // Uses a Postgres function `match_facts` that must be created in migrations.
    // See: packages/db/migrations/match_facts.sql
    const { data, error } = await this.client.rpc('match_facts', {
      query_embedding: `[${embedding.join(',')}]`,
      match_tenant_id: tenantId,
      match_scope: scope,
      match_scope_id: scopeId,
      match_count: limit,
      min_similarity: minSimilarity ?? 0,
    });

    if (error) throwSupabaseError('vectorSearch', error);

    return (data ?? []).map((row: Record<string, unknown>) => ({
      fact: toCamelCase(row as Record<string, unknown>) as unknown as Fact,
      similarity: row['similarity'] as number,
    }));
  }

  // ---------------------------------------------------------------------------
  // Usage
  // ---------------------------------------------------------------------------

  async incrementUsage(
    tenantId: string,
    tokens: number,
    queries: number,
    extractions: number,
    costUsd: number,
  ): Promise<void> {
    // Determine period boundaries (calendar month)
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const { error } = await this.client.from('usage_records').upsert(
      {
        tenant_id: tenantId,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        tokens_used: tokens,
        queries_used: queries,
        extractions_count: extractions,
        cost_usd: costUsd,
      },
      {
        onConflict: 'tenant_id,period_start',
        // ignoreDuplicates is false by default, so the update expression runs
      },
    );
    if (error) throwSupabaseError('incrementUsage', error);
  }

  async getUsage(tenantId: string, periodStart: Date): Promise<UsageRecord | null> {
    const { data, error } = await this.client
      .from('usage_records')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('period_start', periodStart.toISOString())
      .maybeSingle();
    if (error) throwSupabaseError('getUsage', error);
    if (!data) return null;
    return toCamelCase(data as Record<string, unknown>) as unknown as UsageRecord;
  }

  async getCurrentUsage(tenantId: string): Promise<UsageRecord | null> {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return this.getUsage(tenantId, periodStart);
  }

  // ---------------------------------------------------------------------------
  // Stubs — implemented in Plan 3 (Retrieval Engine)
  // ---------------------------------------------------------------------------

  async getFactsByScope(
    _tenantId: string,
    _scope: string,
    _scopeId: string,
    _options: PaginationOptions,
  ): Promise<PaginatedResult<Fact>> {
    throw new Error('SupabaseStorageAdapter.getFactsByScope() not yet implemented. Coming in Plan 3.');
  }

  async purgeFacts(_tenantId: string, _scope: string, _scopeId: string): Promise<number> {
    throw new Error('SupabaseStorageAdapter.purgeFacts() not yet implemented. Coming in Plan 3.');
  }

  async updateDecayScores(
    _tenantId: string,
    _facts: Array<{ id: string; decayScore: number }>,
  ): Promise<void> {
    throw new Error('SupabaseStorageAdapter.updateDecayScores() not yet implemented. Coming in Plan 3.');
  }

  async keywordSearch(_options: KeywordSearchOptions): Promise<Fact[]> {
    throw new Error('SupabaseStorageAdapter.keywordSearch() not yet implemented. Coming in Plan 3.');
  }

  async getEntitiesForTenant(
    _tenantId: string,
    _options: PaginationOptions,
  ): Promise<PaginatedResult<Entity>> {
    throw new Error('SupabaseStorageAdapter.getEntitiesForTenant() not yet implemented. Coming in Plan 3.');
  }

  async getEntitiesForFact(_factId: string): Promise<Entity[]> {
    throw new Error('SupabaseStorageAdapter.getEntitiesForFact() not yet implemented. Coming in Plan 3.');
  }

  async getFactsForEntity(
    _tenantId: string,
    _entityId: string,
    _options: PaginationOptions,
  ): Promise<PaginatedResult<Fact>> {
    throw new Error('SupabaseStorageAdapter.getFactsForEntity() not yet implemented. Coming in Plan 3.');
  }

  async getEdgesForEntity(_tenantId: string, _entityId: string): Promise<Edge[]> {
    throw new Error('SupabaseStorageAdapter.getEdgesForEntity() not yet implemented. Coming in Plan 3.');
  }

  async graphTraversal(_options: GraphTraversalOptions): Promise<GraphTraversalResult> {
    throw new Error('SupabaseStorageAdapter.graphTraversal() not yet implemented. Coming in Plan 3.');
  }

  async createTrigger(_trigger: CreateTrigger & { id: string }): Promise<Trigger> {
    throw new Error('SupabaseStorageAdapter.createTrigger() not yet implemented. Coming in Plan 3.');
  }

  async getTrigger(_tenantId: string, _id: string): Promise<Trigger | null> {
    throw new Error('SupabaseStorageAdapter.getTrigger() not yet implemented. Coming in Plan 3.');
  }

  async getActiveTriggers(_tenantId: string, _scope: string, _scopeId: string): Promise<Trigger[]> {
    throw new Error('SupabaseStorageAdapter.getActiveTriggers() not yet implemented. Coming in Plan 3.');
  }

  async updateTrigger(
    _tenantId: string,
    _id: string,
    _updates: Partial<Trigger>,
  ): Promise<Trigger> {
    throw new Error('SupabaseStorageAdapter.updateTrigger() not yet implemented. Coming in Plan 3.');
  }

  async deleteTrigger(_tenantId: string, _id: string): Promise<void> {
    throw new Error('SupabaseStorageAdapter.deleteTrigger() not yet implemented. Coming in Plan 3.');
  }

  async incrementTriggerFired(_tenantId: string, _id: string): Promise<void> {
    throw new Error('SupabaseStorageAdapter.incrementTriggerFired() not yet implemented. Coming in Plan 3.');
  }

  async createMemoryAccess(
    _access: CreateMemoryAccess & { id: string },
  ): Promise<MemoryAccess> {
    throw new Error('SupabaseStorageAdapter.createMemoryAccess() not yet implemented. Coming in Plan 3.');
  }

  async updateFeedback(
    _tenantId: string,
    _factId: string,
    _feedback: { wasUseful: boolean; feedbackType: string; feedbackDetail?: string },
  ): Promise<void> {
    throw new Error('SupabaseStorageAdapter.updateFeedback() not yet implemented. Coming in Plan 3.');
  }

  async createSession(_session: CreateSession & { id: string }): Promise<Session> {
    throw new Error('SupabaseStorageAdapter.createSession() not yet implemented. Coming in Plan 3.');
  }

  async getSession(_tenantId: string, _id: string): Promise<Session | null> {
    throw new Error('SupabaseStorageAdapter.getSession() not yet implemented. Coming in Plan 3.');
  }

  async endSession(
    _tenantId: string,
    _id: string,
    _summary?: string,
    _topics?: string[],
  ): Promise<Session> {
    throw new Error('SupabaseStorageAdapter.endSession() not yet implemented. Coming in Plan 3.');
  }

  async getSessionsByScope(
    _tenantId: string,
    _scope: string,
    _scopeId: string,
    _options: PaginationOptions,
  ): Promise<PaginatedResult<Session>> {
    throw new Error('SupabaseStorageAdapter.getSessionsByScope() not yet implemented. Coming in Plan 3.');
  }
}

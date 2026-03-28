import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  StorageAdapter,
  PaginationOptions,
  PaginatedResult,
  VectorSearchOptions,
  VectorSearchResult,
  KeywordSearchOptions,
  KeywordSearchResult,
  CompoundSearchOptions,
  CompoundSearchResult,
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
  Webhook,
  CreateWebhook,
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

// ---------------------------------------------------------------------------
// Optional field-level encryption config
// ---------------------------------------------------------------------------

export interface EncryptionConfig {
  /**
   * Encrypt a plaintext string. Called before inserting sensitive text fields.
   * Must return a string in format: `iv:authTag:ciphertext` (all base64).
   * If not provided, fields are stored as plaintext.
   */
  encryptField: (plaintext: string) => string;

  /**
   * Decrypt an encrypted string. Called after fetching sensitive text fields.
   * Input format: `iv:authTag:ciphertext` (all base64).
   * Must handle gracefully if the input is NOT encrypted (plaintext fallback).
   * If not provided, fields are returned as-is.
   */
  decryptField: (ciphertext: string) => string;
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
  private encryption?: EncryptionConfig;

  constructor(
    private client: SupabaseClient,
    encryption?: EncryptionConfig,
  ) {
    this.encryption = encryption;
  }

  // Helper: encrypt a field if encryption is configured, else return as-is
  private enc(value: string | null | undefined): string | null | undefined {
    if (value == null || value === '') return value;
    if (!this.encryption) return value;
    return this.encryption.encryptField(value);
  }

  // Helper: decrypt a field if encryption is configured, else return as-is
  // Also handles graceful fallback: if value does not look encrypted, return as-is
  // This handles mixed rows (old plaintext rows + new encrypted rows)
  private dec(value: string | null | undefined): string | null | undefined {
    if (value == null || value === '') return value;
    if (!this.encryption) return value;
    // Encrypted format: iv:authTag:ciphertext (contains exactly 2 colons)
    // If it doesn't match this pattern, it's plaintext — return as-is
    const parts = value.split(':');
    if (parts.length !== 3) return value; // plaintext fallback
    try {
      return this.encryption.decryptField(value);
    } catch {
      return value; // decryption failed — return as-is rather than crash
    }
  }

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

  async deleteExtraction(tenantId: string, id: string): Promise<void> {
    const { error } = await this.client
      .from('extractions')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', id);
    if (error) throwSupabaseError('deleteExtraction', error);
  }

  async getExtractionsByTenant(
    tenantId: string,
    options: PaginationOptions,
  ): Promise<PaginatedResult<Extraction>> {
    const { limit, cursor } = options;
    let query = this.client
      .from('extractions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    const { data, error } = await query;
    if (error) throwSupabaseError('getExtractionsByTenant', error);

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const extractions = page.map(
      (row) => toCamelCase(row as Record<string, unknown>) as unknown as Extraction,
    );
    const nextCursor = hasMore && page.length > 0
      ? (page[page.length - 1] as Record<string, unknown>)['created_at'] as string
      : null;

    return { data: extractions, cursor: nextCursor, hasMore };
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

    // Encrypt sensitive text fields before storing
    if (row['content'] != null) row['content'] = this.enc(row['content'] as string);
    if (row['source_chunk'] != null) row['source_chunk'] = this.enc(row['source_chunk'] as string);
    if (row['original_content'] != null) row['original_content'] = this.enc(row['original_content'] as string);

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
    const row = data as Record<string, unknown>;
    // Decrypt sensitive text fields after fetching
    if (row['content'] != null) row['content'] = this.dec(row['content'] as string);
    if (row['source_chunk'] != null) row['source_chunk'] = this.dec(row['source_chunk'] as string);
    if (row['original_content'] != null) row['original_content'] = this.dec(row['original_content'] as string);
    return toCamelCase(row) as unknown as Fact;
  }

  async getFactsByIds(tenantId: string, ids: string[]): Promise<Fact[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.client
      .from('facts')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('id', ids);
    if (error) throwSupabaseError('getFactsByIds', error);
    return (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      if (r['content'] != null) r['content'] = this.dec(r['content'] as string);
      if (r['source_chunk'] != null) r['source_chunk'] = this.dec(r['source_chunk'] as string);
      if (r['original_content'] != null) r['original_content'] = this.dec(r['original_content'] as string);
      return toCamelCase(r) as unknown as Fact;
    });
  }

  async getFactsByLineage(tenantId: string, lineageId: string): Promise<Fact[]> {
    const { data, error } = await this.client
      .from('facts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('lineage_id', lineageId)
      .order('version', { ascending: true });
    if (error) throwSupabaseError('getFactsByLineage', error);
    return (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      if (r['content'] != null) r['content'] = this.dec(r['content'] as string);
      if (r['source_chunk'] != null) r['source_chunk'] = this.dec(r['source_chunk'] as string);
      if (r['original_content'] != null) r['original_content'] = this.dec(r['original_content'] as string);
      return toCamelCase(r) as unknown as Fact;
    });
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

    // Encrypt entity name and properties
    if (row['name'] != null) row['name'] = this.enc(row['name'] as string);
    if (row['properties'] != null) {
      const propsStr = typeof row['properties'] === 'string'
        ? row['properties']
        : JSON.stringify(row['properties']);
      row['properties'] = this.enc(propsStr);
    }

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
    const erow = data as Record<string, unknown>;
    if (erow['name'] != null) erow['name'] = this.dec(erow['name'] as string);
    if (erow['properties'] != null) {
      const decrypted = this.dec(erow['properties'] as string);
      try {
        erow['properties'] = decrypted ? JSON.parse(decrypted) : erow['properties'];
      } catch {
        erow['properties'] = decrypted;
      }
    }
    return toCamelCase(erow) as unknown as Entity;
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
    const erow = data as Record<string, unknown>;
    if (erow['name'] != null) erow['name'] = this.dec(erow['name'] as string);
    if (erow['properties'] != null) {
      const decrypted = this.dec(erow['properties'] as string);
      try {
        erow['properties'] = decrypted ? JSON.parse(decrypted) : erow['properties'];
      } catch {
        erow['properties'] = decrypted;
      }
    }
    return toCamelCase(erow) as unknown as Entity;
  }

  async findEntitiesByEmbedding(
    tenantId: string,
    embedding: number[],
    limit: number,
    minSimilarity: number = 0.3,
  ): Promise<Array<{ entity: Entity; similarity: number }>> {
    const { data, error } = await this.client.rpc('match_entities', {
      query_embedding: JSON.stringify(embedding),
      match_tenant_id: tenantId,
      match_count: limit,
      min_similarity: minSimilarity,
    });
    if (error) throwSupabaseError('findEntitiesByEmbedding', error);
    return (data ?? []).map((row: Record<string, unknown>) => {
      if (row['name'] != null) row['name'] = this.dec(row['name'] as string);
      if (row['properties'] != null) {
        const decrypted = this.dec(row['properties'] as string);
        try {
          row['properties'] = decrypted ? JSON.parse(decrypted) : row['properties'];
        } catch {
          row['properties'] = decrypted;
        }
      }
      return {
        entity: toCamelCase(row) as unknown as Entity,
        similarity: row['similarity'] as number,
      };
    });
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
      match_as_of: options.asOf?.toISOString() ?? null,
    });

    if (error) throwSupabaseError('vectorSearch', error);

    return (data ?? []).map((row: Record<string, unknown>) => {
      if (row['content'] != null) row['content'] = this.dec(row['content'] as string);
      if (row['source_chunk'] != null) row['source_chunk'] = this.dec(row['source_chunk'] as string);
      if (row['original_content'] != null) row['original_content'] = this.dec(row['original_content'] as string);
      return {
        fact: toCamelCase(row as Record<string, unknown>) as unknown as Fact,
        similarity: row['similarity'] as number,
      };
    });
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
    // Call the increment_usage Postgres RPC function which atomically
    // increments existing totals via INSERT ... ON CONFLICT DO UPDATE.
    // This avoids the bug where .upsert() replaces values instead of adding.
    const { error } = await this.client.rpc('increment_usage', {
      p_tenant_id: tenantId,
      p_tokens: tokens,
      p_queries: queries,
      p_extractions: extractions,
      p_cost_usd: costUsd,
    });
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
    tenantId: string,
    scope: string,
    scopeId: string,
    options: PaginationOptions,
  ): Promise<PaginatedResult<Fact>> {
    const { limit, cursor } = options;
    let query = this.client
      .from('facts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('scope', scope)
      .eq('scope_id', scopeId)
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    const { data, error } = await query;
    if (error) throwSupabaseError('getFactsByScope', error);

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const facts = page.map((row) => {
      const r = row as Record<string, unknown>;
      if (r['content'] != null) r['content'] = this.dec(r['content'] as string);
      if (r['source_chunk'] != null) r['source_chunk'] = this.dec(r['source_chunk'] as string);
      if (r['original_content'] != null) r['original_content'] = this.dec(r['original_content'] as string);
      return toCamelCase(r) as unknown as Fact;
    });
    const nextCursor = hasMore && page.length > 0
      ? (page[page.length - 1] as Record<string, unknown>)['created_at'] as string
      : null;

    return { data: facts, cursor: nextCursor, hasMore };
  }

  async purgeFacts(tenantId: string, scope: string, scopeId: string): Promise<number> {
    // First, get the IDs of facts to be purged so we can clean up related tables
    const { data: factRows, error: fetchError } = await this.client
      .from('facts')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('scope', scope)
      .eq('scope_id', scopeId);
    if (fetchError) throwSupabaseError('purgeFacts', fetchError);

    const factIds = (factRows ?? []).map((row) => (row as Record<string, unknown>)['id'] as string);
    if (factIds.length === 0) return 0;

    // Delete related fact_entities
    const { error: feError } = await this.client
      .from('fact_entities')
      .delete()
      .in('fact_id', factIds);
    if (feError) throwSupabaseError('purgeFacts', feError);

    // Delete related edges (where fact_id references one of these facts)
    const { error: edgeError } = await this.client
      .from('edges')
      .delete()
      .in('fact_id', factIds);
    if (edgeError) throwSupabaseError('purgeFacts', edgeError);

    // Delete the facts themselves
    const { error: deleteError } = await this.client
      .from('facts')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('scope', scope)
      .eq('scope_id', scopeId);
    if (deleteError) throwSupabaseError('purgeFacts', deleteError);

    // Also delete extraction records for this scope so dedup cache doesn't serve stale results
    const { error: extractionError } = await this.client
      .from('extractions')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('scope', scope)
      .eq('scope_id', scopeId);
    if (extractionError) throwSupabaseError('purgeFacts', extractionError);

    return factIds.length;
  }

  async updateDecayScores(
    tenantId: string,
    facts: Array<{ id: string; decayScore: number; lastAccessed?: Date; frequency?: number; importance?: number }>,
  ): Promise<void> {
    // Batch update each fact's decay_score (and optionally last_accessed, frequency, importance)
    for (const fact of facts) {
      const updates: Record<string, unknown> = {
        decay_score: fact.decayScore,
      };
      if (fact.lastAccessed !== undefined) {
        updates['last_accessed'] = fact.lastAccessed.toISOString();
      }
      if (fact.frequency !== undefined) {
        updates['frequency'] = fact.frequency;
      }
      if (fact.importance !== undefined) {
        updates['importance'] = fact.importance;
      }

      const { error } = await this.client
        .from('facts')
        .update(updates)
        .eq('tenant_id', tenantId)
        .eq('id', fact.id);
      if (error) throwSupabaseError('updateDecayScores', error);
    }
  }

  async keywordSearch(options: KeywordSearchOptions): Promise<KeywordSearchResult[]> {
    const { query, tenantId, scope, scopeId, limit, asOf } = options;

    const { data, error } = await this.client.rpc('keyword_search_facts', {
      search_query: query,
      match_tenant_id: tenantId,
      match_scope: scope,
      match_scope_id: scopeId,
      match_count: limit,
      match_as_of: asOf?.toISOString() ?? null,
    });

    if (error) throwSupabaseError('keywordSearch', error);

    return (data ?? []).map((row: Record<string, unknown>) => {
      if (row['content'] != null) row['content'] = this.dec(row['content'] as string);
      if (row['source_chunk'] != null) row['source_chunk'] = this.dec(row['source_chunk'] as string);
      if (row['original_content'] != null) row['original_content'] = this.dec(row['original_content'] as string);
      const rankScore = row['rank_score'] as number;
      const converted = toCamelCase(row);
      return {
        fact: converted as unknown as Fact,
        rankScore,
      };
    });
  }

  async compoundSearch(options: CompoundSearchOptions): Promise<CompoundSearchResult[]> {
    const { data, error } = await this.client.rpc('steno_search', {
      query_embedding: `[${options.embedding.join(',')}]`,
      search_query: options.query,
      match_tenant_id: options.tenantId,
      match_scope: options.scope,
      match_scope_id: options.scopeId,
      match_count: options.limit,
      min_similarity: options.minSimilarity ?? 0,
    });

    if (error) throwSupabaseError('compoundSearch', error);

    return (data ?? []).map((row: Record<string, unknown>) => {
      if (row['content'] != null) row['content'] = this.dec(row['content'] as string);
      if (row['source_chunk'] != null) row['source_chunk'] = this.dec(row['source_chunk'] as string);
      if (row['original_content'] != null) row['original_content'] = this.dec(row['original_content'] as string);
      return {
        source: row['source'] as 'vector' | 'keyword',
        fact: toCamelCase(row) as unknown as Fact,
        relevanceScore: row['relevance_score'] as number,
      };
    });
  }

  async getEntitiesForTenant(
    tenantId: string,
    options: PaginationOptions,
  ): Promise<PaginatedResult<Entity>> {
    const { limit, cursor } = options;
    let query = this.client
      .from('entities')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true })
      .limit(limit + 1); // fetch one extra to determine hasMore

    if (cursor) {
      query = query.gt('created_at', cursor);
    }

    const { data, error } = await query;
    if (error) throwSupabaseError('getEntitiesForTenant', error);

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const entities = page.map((row) => {
      const r = row as Record<string, unknown>;
      if (r['name'] != null) r['name'] = this.dec(r['name'] as string);
      if (r['properties'] != null) {
        const decrypted = this.dec(r['properties'] as string);
        try {
          r['properties'] = decrypted ? JSON.parse(decrypted) : r['properties'];
        } catch {
          r['properties'] = decrypted;
        }
      }
      return toCamelCase(r) as unknown as Entity;
    });
    const nextCursor = hasMore && page.length > 0
      ? (page[page.length - 1] as Record<string, unknown>)['created_at'] as string
      : null;

    return { data: entities, cursor: nextCursor, hasMore };
  }

  async getEntitiesForFact(factId: string): Promise<Entity[]> {
    // First, get entity IDs from the junction table
    const { data: junctionRows, error: junctionError } = await this.client
      .from('fact_entities')
      .select('entity_id')
      .eq('fact_id', factId);
    if (junctionError) throwSupabaseError('getEntitiesForFact', junctionError);
    if (!junctionRows || junctionRows.length === 0) return [];

    const entityIds = junctionRows.map((row: Record<string, unknown>) => row['entity_id'] as string);

    // Then fetch the full entity records
    const { data, error } = await this.client
      .from('entities')
      .select('*')
      .in('id', entityIds);
    if (error) throwSupabaseError('getEntitiesForFact', error);
    return (data ?? []).map(
      (row) => toCamelCase(row as Record<string, unknown>) as unknown as Entity,
    );
  }

  async getFactsForEntity(
    tenantId: string,
    entityId: string,
    options: PaginationOptions,
  ): Promise<PaginatedResult<Fact>> {
    const { limit, cursor } = options;

    // Use a join via PostgREST's !inner syntax to avoid URL-length issues
    // with large IN clauses (408 UUIDs = ~15KB URL, exceeds PostgREST limit)
    let query = this.client
      .from('fact_entities')
      .select('fact_id, facts!inner(*)')
      .eq('entity_id', entityId)
      .eq('facts.tenant_id', tenantId)
      .order('created_at', { ascending: false, referencedTable: 'facts' })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt('facts.created_at', cursor);
    }

    const { data, error } = await query;
    if (error) throwSupabaseError('getFactsForEntity', error);

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const facts = page.map(
      (row) => {
        // Join returns { fact_id, facts: { ...fact_columns } }
        const factRow = (row as Record<string, unknown>)['facts'] as Record<string, unknown>;
        return toCamelCase(factRow) as unknown as Fact;
      },
    );
    const nextCursor = hasMore && page.length > 0
      ? ((page[page.length - 1] as Record<string, unknown>)['facts'] as Record<string, unknown>)['created_at'] as string
      : null;

    return { data: facts, cursor: nextCursor, hasMore };
  }

  async getFactsForEntities(
    tenantId: string,
    entityIds: string[],
    perEntityLimit: number,
  ): Promise<Array<{ entityId: string; fact: Fact }>> {
    if (entityIds.length === 0) return [];

    const { data, error } = await this.client.rpc('get_facts_for_entities', {
      match_tenant_id: tenantId,
      entity_ids: entityIds,
      per_entity_limit: perEntityLimit,
    });
    if (error) throwSupabaseError('getFactsForEntities', error);

    return (data ?? []).map((row: Record<string, unknown>) => {
      const entityId = row['entity_id'] as string;
      // Build fact from the row (all fact columns are returned)
      const factRow = { ...row };
      delete factRow['entity_id'];
      factRow['id'] = factRow['fact_id'];
      delete factRow['fact_id'];
      return {
        entityId,
        fact: toCamelCase(factRow as Record<string, unknown>) as unknown as Fact,
      };
    });
  }

  async getEdgesForEntity(tenantId: string, entityId: string): Promise<Edge[]> {
    const { data, error } = await this.client
      .from('edges')
      .select('*')
      .eq('tenant_id', tenantId)
      .or(`source_id.eq.${entityId},target_id.eq.${entityId}`);
    if (error) throwSupabaseError('getEdgesForEntity', error);
    return (data ?? []).map(
      (row) => toCamelCase(row as Record<string, unknown>) as unknown as Edge,
    );
  }

  async graphTraversal(options: GraphTraversalOptions): Promise<GraphTraversalResult> {
    const { data, error } = await this.client.rpc('graph_traverse', {
      match_tenant_id: options.tenantId,
      seed_entity_ids: options.entityIds,
      max_depth: options.maxDepth,
      max_entities: options.maxEntities,
      match_as_of: options.asOf?.toISOString() ?? null,
    });

    if (error) throwSupabaseError('graphTraversal', error);

    const rows = (data ?? []) as Record<string, unknown>[];

    // Deduplicate entities by id
    const entityMap = new Map<string, Entity>();
    const edgeMap = new Map<string, Edge>();

    for (const row of rows) {
      const entityId = row['entity_id'] as string;
      if (!entityMap.has(entityId)) {
        entityMap.set(entityId, {
          id: entityId,
          tenantId: options.tenantId,
          name: row['entity_name'] as string,
          entityType: row['entity_type'] as string,
          canonicalName: row['canonical_name'] as string,
          properties: (row['properties'] as Record<string, unknown>) ?? {},
          embeddingModel: null,
          embeddingDim: null,
          mergeTargetId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Filter out null edges (seed entities at depth 0 have null edge fields)
      const edgeId = row['edge_id'] as string | null;
      if (edgeId && !edgeMap.has(edgeId)) {
        edgeMap.set(edgeId, {
          id: edgeId,
          tenantId: options.tenantId,
          sourceId: row['edge_source_id'] as string,
          targetId: row['edge_target_id'] as string,
          relation: row['edge_relation'] as string,
          edgeType: row['edge_type'] as Edge['edgeType'],
          weight: (row['edge_weight'] as number) ?? 1.0,
          validFrom: row['edge_valid_from'] ? new Date(row['edge_valid_from'] as string) : new Date(),
          validUntil: row['edge_valid_until'] ? new Date(row['edge_valid_until'] as string) : null,
          factId: null,
          confidence: (row['edge_confidence'] as number) ?? 1.0,
          metadata: {},
          createdAt: new Date(),
        });
      }
    }

    return {
      entities: Array.from(entityMap.values()),
      edges: Array.from(edgeMap.values()),
    };
  }

  async createTrigger(trigger: CreateTrigger & { id: string }): Promise<Trigger> {
    const row = toSnakeCase(trigger as unknown as Record<string, unknown>);
    const { data, error } = await this.client
      .from('triggers')
      .insert(row)
      .select()
      .single();
    if (error) throwSupabaseError('createTrigger', error);
    return toCamelCase(data as Record<string, unknown>) as unknown as Trigger;
  }

  async getTrigger(tenantId: string, id: string): Promise<Trigger | null> {
    const { data, error } = await this.client
      .from('triggers')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    if (error) throwSupabaseError('getTrigger', error);
    if (!data) return null;
    return toCamelCase(data as Record<string, unknown>) as unknown as Trigger;
  }

  async getActiveTriggers(tenantId: string, scope: string, scopeId: string): Promise<Trigger[]> {
    const { data, error } = await this.client
      .from('triggers')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('scope', scope)
      .eq('scope_id', scopeId)
      .eq('active', true)
      .order('priority', { ascending: false });
    if (error) throwSupabaseError('getActiveTriggers', error);
    return (data ?? []).map(
      (row) => toCamelCase(row as Record<string, unknown>) as unknown as Trigger,
    );
  }

  async updateTrigger(
    tenantId: string,
    id: string,
    updates: Partial<Trigger>,
  ): Promise<Trigger> {
    const row = toSnakeCase(updates as unknown as Record<string, unknown>);
    const { data, error } = await this.client
      .from('triggers')
      .update(row)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select()
      .single();
    if (error) throwSupabaseError('updateTrigger', error);
    return toCamelCase(data as Record<string, unknown>) as unknown as Trigger;
  }

  async deleteTrigger(tenantId: string, id: string): Promise<void> {
    const { error } = await this.client
      .from('triggers')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', id);
    if (error) throwSupabaseError('deleteTrigger', error);
  }

  async incrementTriggerFired(tenantId: string, id: string): Promise<void> {
    const { error } = await this.client.rpc('increment_trigger_fired', {
      p_tenant_id: tenantId,
      p_trigger_id: id,
    });
    if (error) throwSupabaseError('incrementTriggerFired', error);
  }

  async createMemoryAccess(
    access: CreateMemoryAccess & { id: string },
  ): Promise<MemoryAccess> {
    const row = toSnakeCase(access as unknown as Record<string, unknown>);
    const { data, error } = await this.client
      .from('memory_accesses')
      .insert(row)
      .select()
      .single();
    if (error) throwSupabaseError('createMemoryAccess', error);
    return toCamelCase(data as Record<string, unknown>) as unknown as MemoryAccess;
  }

  async updateFeedback(
    tenantId: string,
    factId: string,
    feedback: { wasUseful: boolean; feedbackType: string; feedbackDetail?: string; wasCorrected?: boolean },
  ): Promise<void> {
    // Update the MOST RECENT memory access for this fact
    const { data: accessRows, error: findError } = await this.client
      .from('memory_accesses')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('fact_id', factId)
      .order('accessed_at', { ascending: false })
      .limit(1);
    if (findError) throwSupabaseError('updateFeedback', findError);
    if (!accessRows || accessRows.length === 0) return;

    const accessId = (accessRows[0] as Record<string, unknown>)['id'] as string;
    const { error } = await this.client
      .from('memory_accesses')
      .update({
        was_useful: feedback.wasUseful,
        feedback_type: feedback.feedbackType,
        feedback_detail: feedback.feedbackDetail ?? null,
        was_corrected: feedback.wasCorrected ?? false,
      })
      .eq('id', accessId);
    if (error) throwSupabaseError('updateFeedback', error);
  }

  async createSession(session: CreateSession & { id: string }): Promise<Session> {
    const row = toSnakeCase(session as unknown as Record<string, unknown>);
    const { data, error } = await this.client
      .from('sessions')
      .insert(row)
      .select()
      .single();
    if (error) throwSupabaseError('createSession', error);
    return toCamelCase(data as Record<string, unknown>) as unknown as Session;
  }

  async getSession(tenantId: string, id: string): Promise<Session | null> {
    const { data, error } = await this.client
      .from('sessions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    if (error) throwSupabaseError('getSession', error);
    if (!data) return null;
    return toCamelCase(data as Record<string, unknown>) as unknown as Session;
  }

  async endSession(
    tenantId: string,
    id: string,
    summary?: string,
    topics?: string[],
  ): Promise<Session> {
    const updates: Record<string, unknown> = {
      ended_at: new Date().toISOString(),
    };
    if (summary !== undefined) updates['summary'] = summary;
    if (topics !== undefined) updates['topics'] = topics;

    const { data, error } = await this.client
      .from('sessions')
      .update(updates)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select()
      .single();
    if (error) throwSupabaseError('endSession', error);
    return toCamelCase(data as Record<string, unknown>) as unknown as Session;
  }

  async getSessionsByScope(
    tenantId: string,
    scope: string,
    scopeId: string,
    options: PaginationOptions,
  ): Promise<PaginatedResult<Session>> {
    const { limit, cursor } = options;
    let query = this.client
      .from('sessions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('scope', scope)
      .eq('scope_id', scopeId)
      .order('started_at', { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt('started_at', cursor);
    }

    const { data, error } = await query;
    if (error) throwSupabaseError('getSessionsByScope', error);

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const sessions = page.map(
      (row) => toCamelCase(row as Record<string, unknown>) as unknown as Session,
    );
    const nextCursor = hasMore && page.length > 0
      ? (page[page.length - 1] as Record<string, unknown>)['started_at'] as string
      : null;

    return { data: sessions, cursor: nextCursor, hasMore };
  }

  // ---------------------------------------------------------------------------
  // Session Messages
  // ---------------------------------------------------------------------------

  async addSessionMessage(msg: {
    id: string;
    sessionId: string;
    tenantId: string;
    role: string;
    content: string;
    turnNumber: number;
  }): Promise<void> {
    const { error } = await this.client
      .from('session_messages')
      .insert({
        id: msg.id,
        session_id: msg.sessionId,
        tenant_id: msg.tenantId,
        role: msg.role,
        content: this.enc(msg.content) as string,
        turn_number: msg.turnNumber,
      });
    if (error) throwSupabaseError('addSessionMessage', error);
  }

  async getSessionMessages(
    tenantId: string,
    sessionId: string,
    options?: { unextractedOnly?: boolean },
  ): Promise<Array<{ id: string; role: string; content: string; turnNumber: number; createdAt: Date }>> {
    let query = this.client
      .from('session_messages')
      .select('id, role, content, turn_number, created_at')
      .eq('tenant_id', tenantId)
      .eq('session_id', sessionId)
      .order('turn_number', { ascending: true });

    if (options?.unextractedOnly) {
      query = query.is('extraction_id', null);
    }

    const { data, error } = await query;
    if (error) throwSupabaseError('getSessionMessages', error);

    return (data ?? []).map((row) => ({
      id: row.id as string,
      role: row.role as string,
      content: this.dec(row.content as string) as string,
      turnNumber: row.turn_number as number,
      createdAt: new Date(row.created_at as string),
    }));
  }

  async markMessagesExtracted(
    messageIds: string[],
    extractionId: string,
  ): Promise<void> {
    if (messageIds.length === 0) return;
    const { error } = await this.client
      .from('session_messages')
      .update({ extraction_id: extractionId })
      .in('id', messageIds);
    if (error) throwSupabaseError('markMessagesExtracted', error);
  }

  // ---------------------------------------------------------------------------
  // Webhooks
  // ---------------------------------------------------------------------------

  async createWebhook(
    webhook: CreateWebhook & { id: string; secretHash: string; signingKey: string },
  ): Promise<Webhook> {
    // CreateWebhook has `secret` but we don't store it separately — signingKey holds the raw
    // secret for HMAC signing, and secretHash holds the hashed version.
    // Strip `secret` before inserting; it's not a DB column.
    const { secret: _secret, ...rest } = webhook;
    const row = toSnakeCase(rest as unknown as Record<string, unknown>);
    const { data, error } = await this.client
      .from('webhooks')
      .insert(row)
      .select()
      .single();
    if (error) throwSupabaseError('createWebhook', error);
    return toCamelCase(data as Record<string, unknown>) as unknown as Webhook;
  }

  async getWebhook(tenantId: string, id: string): Promise<Webhook | null> {
    const { data, error } = await this.client
      .from('webhooks')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    if (error) throwSupabaseError('getWebhook', error);
    if (!data) return null;
    return toCamelCase(data as Record<string, unknown>) as unknown as Webhook;
  }

  async getWebhooksForTenant(tenantId: string): Promise<Webhook[]> {
    const { data, error } = await this.client
      .from('webhooks')
      .select('*')
      .eq('tenant_id', tenantId);
    if (error) throwSupabaseError('getWebhooksForTenant', error);
    return (data ?? []).map(
      (row) => toCamelCase(row as Record<string, unknown>) as unknown as Webhook,
    );
  }

  async getWebhooksByEvent(tenantId: string, event: string): Promise<Webhook[]> {
    const { data, error } = await this.client
      .from('webhooks')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .contains('events', [event]);
    if (error) throwSupabaseError('getWebhooksByEvent', error);
    return (data ?? []).map(
      (row) => toCamelCase(row as Record<string, unknown>) as unknown as Webhook,
    );
  }

  async deleteWebhook(tenantId: string, id: string): Promise<void> {
    const { error } = await this.client
      .from('webhooks')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', id);
    if (error) throwSupabaseError('deleteWebhook', error);
  }
}

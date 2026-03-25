// =============================================================================
// camelCase ↔ snake_case conversion utilities
// =============================================================================
/**
 * Convert a single camelCase key to snake_case.
 * e.g. tenantId → tenant_id, validFrom → valid_from
 */
function camelToSnake(key) {
    return key.replace(/([A-Z])/g, (match) => `_${match.toLowerCase()}`);
}
/**
 * Convert a single snake_case key to camelCase.
 * e.g. tenant_id → tenantId, valid_from → validFrom
 */
function snakeToCamel(key) {
    return key.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
}
/**
 * Convert all top-level keys of a plain object from camelCase to snake_case.
 * Nested objects (metadata, config, properties, condition) are preserved as-is.
 * Arrays and null values are preserved.
 */
export function toSnakeCase(obj) {
    const result = {};
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
export function toCamelCase(obj) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        result[snakeToCamel(key)] = value;
    }
    return result;
}
// =============================================================================
// Error helpers
// =============================================================================
function throwSupabaseError(method, error) {
    throw new Error(`SupabaseStorageAdapter.${method}() failed: ${error?.message ?? 'unknown error'}`);
}
// =============================================================================
// SupabaseStorageAdapter
// =============================================================================
export class SupabaseStorageAdapter {
    client;
    constructor(client) {
        this.client = client;
    }
    async ping() {
        const { error } = await this.client.from('tenants').select('id').limit(1);
        return !error;
    }
    // ---------------------------------------------------------------------------
    // Tenants
    // ---------------------------------------------------------------------------
    async createTenant(tenant) {
        const row = toSnakeCase(tenant);
        const { data, error } = await this.client
            .from('tenants')
            .insert(row)
            .select()
            .single();
        if (error)
            throwSupabaseError('createTenant', error);
        return toCamelCase(data);
    }
    async getTenant(id) {
        const { data, error } = await this.client
            .from('tenants')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error)
            throwSupabaseError('getTenant', error);
        if (!data)
            return null;
        return toCamelCase(data);
    }
    async getTenantBySlug(slug) {
        const { data, error } = await this.client
            .from('tenants')
            .select('*')
            .eq('slug', slug)
            .maybeSingle();
        if (error)
            throwSupabaseError('getTenantBySlug', error);
        if (!data)
            return null;
        return toCamelCase(data);
    }
    async updateTenant(id, updates) {
        const row = toSnakeCase(updates);
        const { data, error } = await this.client
            .from('tenants')
            .update(row)
            .eq('id', id)
            .select()
            .single();
        if (error)
            throwSupabaseError('updateTenant', error);
        return toCamelCase(data);
    }
    // ---------------------------------------------------------------------------
    // API Keys
    // ---------------------------------------------------------------------------
    async createApiKey(apiKey) {
        const row = toSnakeCase(apiKey);
        const { data, error } = await this.client
            .from('api_keys')
            .insert(row)
            .select()
            .single();
        if (error)
            throwSupabaseError('createApiKey', error);
        return toCamelCase(data);
    }
    async getApiKeyByPrefix(prefix) {
        const { data, error } = await this.client
            .from('api_keys')
            .select('*')
            .eq('key_prefix', prefix)
            .eq('active', true)
            .maybeSingle();
        if (error)
            throwSupabaseError('getApiKeyByPrefix', error);
        if (!data)
            return null;
        return toCamelCase(data);
    }
    async getApiKeysForTenant(tenantId) {
        const { data, error } = await this.client
            .from('api_keys')
            .select('*')
            .eq('tenant_id', tenantId);
        if (error)
            throwSupabaseError('getApiKeysForTenant', error);
        return (data ?? []).map((row) => toCamelCase(row));
    }
    async revokeApiKey(tenantId, id) {
        const { error } = await this.client
            .from('api_keys')
            .update({ active: false })
            .eq('id', id)
            .eq('tenant_id', tenantId);
        if (error)
            throwSupabaseError('revokeApiKey', error);
    }
    async updateApiKeyLastUsed(id) {
        const { error } = await this.client
            .from('api_keys')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', id);
        if (error)
            throwSupabaseError('updateApiKeyLastUsed', error);
    }
    // ---------------------------------------------------------------------------
    // Extractions
    // ---------------------------------------------------------------------------
    async createExtraction(extraction) {
        const row = toSnakeCase({
            ...extraction,
            status: 'queued',
        });
        const { data, error } = await this.client
            .from('extractions')
            .insert(row)
            .select()
            .single();
        if (error)
            throwSupabaseError('createExtraction', error);
        return toCamelCase(data);
    }
    async getExtraction(tenantId, id) {
        const { data, error } = await this.client
            .from('extractions')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('id', id)
            .maybeSingle();
        if (error)
            throwSupabaseError('getExtraction', error);
        if (!data)
            return null;
        return toCamelCase(data);
    }
    async updateExtraction(tenantId, id, updates) {
        const row = toSnakeCase(updates);
        const { data, error } = await this.client
            .from('extractions')
            .update(row)
            .eq('tenant_id', tenantId)
            .eq('id', id)
            .select()
            .single();
        if (error)
            throwSupabaseError('updateExtraction', error);
        return toCamelCase(data);
    }
    async getExtractionByHash(tenantId, inputHash) {
        const { data, error } = await this.client
            .from('extractions')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('input_hash', inputHash)
            .maybeSingle();
        if (error)
            throwSupabaseError('getExtractionByHash', error);
        if (!data)
            return null;
        return toCamelCase(data);
    }
    async getExtractionsByTenant(tenantId, options) {
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
        if (error)
            throwSupabaseError('getExtractionsByTenant', error);
        const rows = data ?? [];
        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        const extractions = page.map((row) => toCamelCase(row));
        const nextCursor = hasMore && page.length > 0
            ? page[page.length - 1]['created_at']
            : null;
        return { data: extractions, cursor: nextCursor, hasMore };
    }
    // ---------------------------------------------------------------------------
    // Facts
    // ---------------------------------------------------------------------------
    async createFact(fact) {
        const { embedding, ...rest } = fact;
        const row = toSnakeCase(rest);
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
        if (error)
            throwSupabaseError('createFact', error);
        return toCamelCase(data);
    }
    async getFact(tenantId, id) {
        const { data, error } = await this.client
            .from('facts')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('id', id)
            .maybeSingle();
        if (error)
            throwSupabaseError('getFact', error);
        if (!data)
            return null;
        return toCamelCase(data);
    }
    async getFactsByIds(tenantId, ids) {
        if (ids.length === 0)
            return [];
        const { data, error } = await this.client
            .from('facts')
            .select('*')
            .eq('tenant_id', tenantId)
            .in('id', ids);
        if (error)
            throwSupabaseError('getFactsByIds', error);
        return (data ?? []).map((row) => toCamelCase(row));
    }
    async getFactsByLineage(tenantId, lineageId) {
        const { data, error } = await this.client
            .from('facts')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('lineage_id', lineageId)
            .order('version', { ascending: true });
        if (error)
            throwSupabaseError('getFactsByLineage', error);
        return (data ?? []).map((row) => toCamelCase(row));
    }
    async invalidateFact(tenantId, id) {
        const { error } = await this.client
            .from('facts')
            .update({ valid_until: new Date().toISOString() })
            .eq('tenant_id', tenantId)
            .eq('id', id);
        if (error)
            throwSupabaseError('invalidateFact', error);
    }
    // ---------------------------------------------------------------------------
    // Entities
    // ---------------------------------------------------------------------------
    async createEntity(entity) {
        const { embedding, ...rest } = entity;
        const row = toSnakeCase(rest);
        if (embedding !== undefined) {
            row['embedding'] = `[${embedding.join(',')}]`;
        }
        const { data, error } = await this.client
            .from('entities')
            .insert(row)
            .select()
            .single();
        if (error)
            throwSupabaseError('createEntity', error);
        return toCamelCase(data);
    }
    async getEntity(tenantId, id) {
        const { data, error } = await this.client
            .from('entities')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('id', id)
            .maybeSingle();
        if (error)
            throwSupabaseError('getEntity', error);
        if (!data)
            return null;
        return toCamelCase(data);
    }
    async findEntityByCanonicalName(tenantId, canonicalName, entityType) {
        const { data, error } = await this.client
            .from('entities')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('canonical_name', canonicalName)
            .eq('entity_type', entityType)
            .maybeSingle();
        if (error)
            throwSupabaseError('findEntityByCanonicalName', error);
        if (!data)
            return null;
        return toCamelCase(data);
    }
    async findEntitiesByEmbedding(tenantId, embedding, limit, minSimilarity = 0.3) {
        const { data, error } = await this.client.rpc('match_entities', {
            query_embedding: JSON.stringify(embedding),
            match_tenant_id: tenantId,
            match_count: limit,
            min_similarity: minSimilarity,
        });
        if (error)
            throwSupabaseError('findEntitiesByEmbedding', error);
        return (data ?? []).map((row) => ({
            entity: toCamelCase(row),
            similarity: row['similarity'],
        }));
    }
    // ---------------------------------------------------------------------------
    // Fact-Entity junction
    // ---------------------------------------------------------------------------
    async linkFactEntity(factId, entityId, role) {
        const { error } = await this.client.from('fact_entities').insert({
            fact_id: factId,
            entity_id: entityId,
            role,
        });
        if (error)
            throwSupabaseError('linkFactEntity', error);
    }
    // ---------------------------------------------------------------------------
    // Edges
    // ---------------------------------------------------------------------------
    async createEdge(edge) {
        const row = toSnakeCase(edge);
        const { data, error } = await this.client
            .from('edges')
            .insert(row)
            .select()
            .single();
        if (error)
            throwSupabaseError('createEdge', error);
        return toCamelCase(data);
    }
    // ---------------------------------------------------------------------------
    // Vector search
    // ---------------------------------------------------------------------------
    async vectorSearch(options) {
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
        if (error)
            throwSupabaseError('vectorSearch', error);
        return (data ?? []).map((row) => ({
            fact: toCamelCase(row),
            similarity: row['similarity'],
        }));
    }
    // ---------------------------------------------------------------------------
    // Usage
    // ---------------------------------------------------------------------------
    async incrementUsage(tenantId, tokens, queries, extractions, costUsd) {
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
        if (error)
            throwSupabaseError('incrementUsage', error);
    }
    async getUsage(tenantId, periodStart) {
        const { data, error } = await this.client
            .from('usage_records')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('period_start', periodStart.toISOString())
            .maybeSingle();
        if (error)
            throwSupabaseError('getUsage', error);
        if (!data)
            return null;
        return toCamelCase(data);
    }
    async getCurrentUsage(tenantId) {
        const now = new Date();
        const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return this.getUsage(tenantId, periodStart);
    }
    // ---------------------------------------------------------------------------
    // Stubs — implemented in Plan 3 (Retrieval Engine)
    // ---------------------------------------------------------------------------
    async getFactsByScope(tenantId, scope, scopeId, options) {
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
        if (error)
            throwSupabaseError('getFactsByScope', error);
        const rows = data ?? [];
        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        const facts = page.map((row) => toCamelCase(row));
        const nextCursor = hasMore && page.length > 0
            ? page[page.length - 1]['created_at']
            : null;
        return { data: facts, cursor: nextCursor, hasMore };
    }
    async purgeFacts(tenantId, scope, scopeId) {
        // First, get the IDs of facts to be purged so we can clean up related tables
        const { data: factRows, error: fetchError } = await this.client
            .from('facts')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('scope', scope)
            .eq('scope_id', scopeId);
        if (fetchError)
            throwSupabaseError('purgeFacts', fetchError);
        const factIds = (factRows ?? []).map((row) => row['id']);
        if (factIds.length === 0)
            return 0;
        // Delete related fact_entities
        const { error: feError } = await this.client
            .from('fact_entities')
            .delete()
            .in('fact_id', factIds);
        if (feError)
            throwSupabaseError('purgeFacts', feError);
        // Delete related edges (where fact_id references one of these facts)
        const { error: edgeError } = await this.client
            .from('edges')
            .delete()
            .in('fact_id', factIds);
        if (edgeError)
            throwSupabaseError('purgeFacts', edgeError);
        // Delete the facts themselves
        const { error: deleteError } = await this.client
            .from('facts')
            .delete()
            .eq('tenant_id', tenantId)
            .eq('scope', scope)
            .eq('scope_id', scopeId);
        if (deleteError)
            throwSupabaseError('purgeFacts', deleteError);
        // Also delete extraction records for this scope so dedup cache doesn't serve stale results
        const { error: extractionError } = await this.client
            .from('extractions')
            .delete()
            .eq('tenant_id', tenantId)
            .eq('scope', scope)
            .eq('scope_id', scopeId);
        if (extractionError)
            throwSupabaseError('purgeFacts', extractionError);
        return factIds.length;
    }
    async updateDecayScores(tenantId, facts) {
        // Batch update each fact's decay_score (and optionally last_accessed, frequency, importance)
        for (const fact of facts) {
            const updates = {
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
            if (error)
                throwSupabaseError('updateDecayScores', error);
        }
    }
    async keywordSearch(options) {
        const { query, tenantId, scope, scopeId, limit, asOf } = options;
        const { data, error } = await this.client.rpc('keyword_search_facts', {
            search_query: query,
            match_tenant_id: tenantId,
            match_scope: scope,
            match_scope_id: scopeId,
            match_count: limit,
            match_as_of: asOf?.toISOString() ?? null,
        });
        if (error)
            throwSupabaseError('keywordSearch', error);
        return (data ?? []).map((row) => {
            const rankScore = row['rank_score'];
            const converted = toCamelCase(row);
            return {
                fact: converted,
                rankScore,
            };
        });
    }
    async compoundSearch(options) {
        const { data, error } = await this.client.rpc('steno_search', {
            query_embedding: `[${options.embedding.join(',')}]`,
            search_query: options.query,
            match_tenant_id: options.tenantId,
            match_scope: options.scope,
            match_scope_id: options.scopeId,
            match_count: options.limit,
            min_similarity: options.minSimilarity ?? 0,
        });
        if (error)
            throwSupabaseError('compoundSearch', error);
        return (data ?? []).map((row) => ({
            source: row['source'],
            fact: toCamelCase(row),
            relevanceScore: row['relevance_score'],
        }));
    }
    async getEntitiesForTenant(tenantId, options) {
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
        if (error)
            throwSupabaseError('getEntitiesForTenant', error);
        const rows = data ?? [];
        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        const entities = page.map((row) => toCamelCase(row));
        const nextCursor = hasMore && page.length > 0
            ? page[page.length - 1]['created_at']
            : null;
        return { data: entities, cursor: nextCursor, hasMore };
    }
    async getEntitiesForFact(factId) {
        // First, get entity IDs from the junction table
        const { data: junctionRows, error: junctionError } = await this.client
            .from('fact_entities')
            .select('entity_id')
            .eq('fact_id', factId);
        if (junctionError)
            throwSupabaseError('getEntitiesForFact', junctionError);
        if (!junctionRows || junctionRows.length === 0)
            return [];
        const entityIds = junctionRows.map((row) => row['entity_id']);
        // Then fetch the full entity records
        const { data, error } = await this.client
            .from('entities')
            .select('*')
            .in('id', entityIds);
        if (error)
            throwSupabaseError('getEntitiesForFact', error);
        return (data ?? []).map((row) => toCamelCase(row));
    }
    async getFactsForEntity(tenantId, entityId, options) {
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
        if (error)
            throwSupabaseError('getFactsForEntity', error);
        const rows = data ?? [];
        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        const facts = page.map((row) => {
            // Join returns { fact_id, facts: { ...fact_columns } }
            const factRow = row['facts'];
            return toCamelCase(factRow);
        });
        const nextCursor = hasMore && page.length > 0
            ? page[page.length - 1]['facts']['created_at']
            : null;
        return { data: facts, cursor: nextCursor, hasMore };
    }
    async getFactsForEntities(tenantId, entityIds, perEntityLimit) {
        if (entityIds.length === 0)
            return [];
        const { data, error } = await this.client.rpc('get_facts_for_entities', {
            match_tenant_id: tenantId,
            entity_ids: entityIds,
            per_entity_limit: perEntityLimit,
        });
        if (error)
            throwSupabaseError('getFactsForEntities', error);
        return (data ?? []).map((row) => {
            const entityId = row['entity_id'];
            // Build fact from the row (all fact columns are returned)
            const factRow = { ...row };
            delete factRow['entity_id'];
            factRow['id'] = factRow['fact_id'];
            delete factRow['fact_id'];
            return {
                entityId,
                fact: toCamelCase(factRow),
            };
        });
    }
    async getEdgesForEntity(tenantId, entityId) {
        const { data, error } = await this.client
            .from('edges')
            .select('*')
            .eq('tenant_id', tenantId)
            .or(`source_id.eq.${entityId},target_id.eq.${entityId}`);
        if (error)
            throwSupabaseError('getEdgesForEntity', error);
        return (data ?? []).map((row) => toCamelCase(row));
    }
    async graphTraversal(options) {
        const { data, error } = await this.client.rpc('graph_traverse', {
            match_tenant_id: options.tenantId,
            seed_entity_ids: options.entityIds,
            max_depth: options.maxDepth,
            max_entities: options.maxEntities,
            match_as_of: options.asOf?.toISOString() ?? null,
        });
        if (error)
            throwSupabaseError('graphTraversal', error);
        const rows = (data ?? []);
        // Deduplicate entities by id
        const entityMap = new Map();
        const edgeMap = new Map();
        for (const row of rows) {
            const entityId = row['entity_id'];
            if (!entityMap.has(entityId)) {
                entityMap.set(entityId, {
                    id: entityId,
                    tenantId: options.tenantId,
                    name: row['entity_name'],
                    entityType: row['entity_type'],
                    canonicalName: row['canonical_name'],
                    properties: row['properties'] ?? {},
                    embeddingModel: null,
                    embeddingDim: null,
                    mergeTargetId: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            }
            // Filter out null edges (seed entities at depth 0 have null edge fields)
            const edgeId = row['edge_id'];
            if (edgeId && !edgeMap.has(edgeId)) {
                edgeMap.set(edgeId, {
                    id: edgeId,
                    tenantId: options.tenantId,
                    sourceId: row['edge_source_id'],
                    targetId: row['edge_target_id'],
                    relation: row['edge_relation'],
                    edgeType: row['edge_type'],
                    weight: row['edge_weight'] ?? 1.0,
                    validFrom: row['edge_valid_from'] ? new Date(row['edge_valid_from']) : new Date(),
                    validUntil: row['edge_valid_until'] ? new Date(row['edge_valid_until']) : null,
                    factId: null,
                    confidence: row['edge_confidence'] ?? 1.0,
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
    async createTrigger(trigger) {
        const row = toSnakeCase(trigger);
        const { data, error } = await this.client
            .from('triggers')
            .insert(row)
            .select()
            .single();
        if (error)
            throwSupabaseError('createTrigger', error);
        return toCamelCase(data);
    }
    async getTrigger(tenantId, id) {
        const { data, error } = await this.client
            .from('triggers')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('id', id)
            .maybeSingle();
        if (error)
            throwSupabaseError('getTrigger', error);
        if (!data)
            return null;
        return toCamelCase(data);
    }
    async getActiveTriggers(tenantId, scope, scopeId) {
        const { data, error } = await this.client
            .from('triggers')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('scope', scope)
            .eq('scope_id', scopeId)
            .eq('active', true)
            .order('priority', { ascending: false });
        if (error)
            throwSupabaseError('getActiveTriggers', error);
        return (data ?? []).map((row) => toCamelCase(row));
    }
    async updateTrigger(tenantId, id, updates) {
        const row = toSnakeCase(updates);
        const { data, error } = await this.client
            .from('triggers')
            .update(row)
            .eq('tenant_id', tenantId)
            .eq('id', id)
            .select()
            .single();
        if (error)
            throwSupabaseError('updateTrigger', error);
        return toCamelCase(data);
    }
    async deleteTrigger(tenantId, id) {
        const { error } = await this.client
            .from('triggers')
            .delete()
            .eq('tenant_id', tenantId)
            .eq('id', id);
        if (error)
            throwSupabaseError('deleteTrigger', error);
    }
    async incrementTriggerFired(tenantId, id) {
        const { error } = await this.client.rpc('increment_trigger_fired', {
            p_tenant_id: tenantId,
            p_trigger_id: id,
        });
        if (error)
            throwSupabaseError('incrementTriggerFired', error);
    }
    async createMemoryAccess(access) {
        const row = toSnakeCase(access);
        const { data, error } = await this.client
            .from('memory_accesses')
            .insert(row)
            .select()
            .single();
        if (error)
            throwSupabaseError('createMemoryAccess', error);
        return toCamelCase(data);
    }
    async updateFeedback(tenantId, factId, feedback) {
        // Update the MOST RECENT memory access for this fact
        const { data: accessRows, error: findError } = await this.client
            .from('memory_accesses')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('fact_id', factId)
            .order('accessed_at', { ascending: false })
            .limit(1);
        if (findError)
            throwSupabaseError('updateFeedback', findError);
        if (!accessRows || accessRows.length === 0)
            return;
        const accessId = accessRows[0]['id'];
        const { error } = await this.client
            .from('memory_accesses')
            .update({
            was_useful: feedback.wasUseful,
            feedback_type: feedback.feedbackType,
            feedback_detail: feedback.feedbackDetail ?? null,
            was_corrected: feedback.wasCorrected ?? false,
        })
            .eq('id', accessId);
        if (error)
            throwSupabaseError('updateFeedback', error);
    }
    async createSession(session) {
        const row = toSnakeCase(session);
        const { data, error } = await this.client
            .from('sessions')
            .insert(row)
            .select()
            .single();
        if (error)
            throwSupabaseError('createSession', error);
        return toCamelCase(data);
    }
    async getSession(tenantId, id) {
        const { data, error } = await this.client
            .from('sessions')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('id', id)
            .maybeSingle();
        if (error)
            throwSupabaseError('getSession', error);
        if (!data)
            return null;
        return toCamelCase(data);
    }
    async endSession(tenantId, id, summary, topics) {
        const updates = {
            ended_at: new Date().toISOString(),
        };
        if (summary !== undefined)
            updates['summary'] = summary;
        if (topics !== undefined)
            updates['topics'] = topics;
        const { data, error } = await this.client
            .from('sessions')
            .update(updates)
            .eq('tenant_id', tenantId)
            .eq('id', id)
            .select()
            .single();
        if (error)
            throwSupabaseError('endSession', error);
        return toCamelCase(data);
    }
    async getSessionsByScope(tenantId, scope, scopeId, options) {
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
        if (error)
            throwSupabaseError('getSessionsByScope', error);
        const rows = data ?? [];
        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        const sessions = page.map((row) => toCamelCase(row));
        const nextCursor = hasMore && page.length > 0
            ? page[page.length - 1]['started_at']
            : null;
        return { data: sessions, cursor: nextCursor, hasMore };
    }
    // ---------------------------------------------------------------------------
    // Webhooks
    // ---------------------------------------------------------------------------
    async createWebhook(webhook) {
        // CreateWebhook has `secret` but we don't store it separately — signingKey holds the raw
        // secret for HMAC signing, and secretHash holds the hashed version.
        // Strip `secret` before inserting; it's not a DB column.
        const { secret: _secret, ...rest } = webhook;
        const row = toSnakeCase(rest);
        const { data, error } = await this.client
            .from('webhooks')
            .insert(row)
            .select()
            .single();
        if (error)
            throwSupabaseError('createWebhook', error);
        return toCamelCase(data);
    }
    async getWebhook(tenantId, id) {
        const { data, error } = await this.client
            .from('webhooks')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('id', id)
            .maybeSingle();
        if (error)
            throwSupabaseError('getWebhook', error);
        if (!data)
            return null;
        return toCamelCase(data);
    }
    async getWebhooksForTenant(tenantId) {
        const { data, error } = await this.client
            .from('webhooks')
            .select('*')
            .eq('tenant_id', tenantId);
        if (error)
            throwSupabaseError('getWebhooksForTenant', error);
        return (data ?? []).map((row) => toCamelCase(row));
    }
    async getWebhooksByEvent(tenantId, event) {
        const { data, error } = await this.client
            .from('webhooks')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('active', true)
            .contains('events', [event]);
        if (error)
            throwSupabaseError('getWebhooksByEvent', error);
        return (data ?? []).map((row) => toCamelCase(row));
    }
    async deleteWebhook(tenantId, id) {
        const { error } = await this.client
            .from('webhooks')
            .delete()
            .eq('tenant_id', tenantId)
            .eq('id', id);
        if (error)
            throwSupabaseError('deleteWebhook', error);
    }
}
//# sourceMappingURL=storage.js.map
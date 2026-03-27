import Database from 'better-sqlite3';
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
import { initializeDatabase } from './schema.js';
import { cosineSimilarity, serializeEmbedding, deserializeEmbedding } from './vector.js';
import { indexFact, removeFact, searchFTS } from './fts.js';
import { encodeCursor, decodeCursor, type CursorData } from './cursor.js';

// =============================================================================
// Helpers
// =============================================================================

function now(): string {
  return new Date().toISOString();
}

function toDate(val: string | null | undefined): Date | null {
  if (!val) return null;
  return new Date(val);
}

function toBool(val: number | null | undefined): boolean | null {
  if (val === null || val === undefined) return null;
  return val === 1;
}

function fromBool(val: boolean | undefined | null): number | null {
  if (val === null || val === undefined) return null;
  return val ? 1 : 0;
}

function parseJsonOr<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

// =============================================================================
// Row → Model mappers
// =============================================================================

function rowToTenant(row: Record<string, unknown>): Tenant {
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    slug: row['slug'] as string,
    config: parseJsonOr(row['config'] as string, {}) as Tenant['config'],
    plan: row['plan'] as Tenant['plan'],
    tokenLimitMonthly: row['token_limit_monthly'] as number,
    queryLimitMonthly: row['query_limit_monthly'] as number,
    stripeCustomerId: (row['stripe_customer_id'] as string) ?? null,
    stripeSubscriptionId: (row['stripe_subscription_id'] as string) ?? null,
    active: row['active'] === 1,
    createdAt: new Date(row['created_at'] as string),
    updatedAt: new Date(row['updated_at'] as string),
  };
}

function rowToApiKey(row: Record<string, unknown>): ApiKey {
  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    keyHash: row['key_hash'] as string,
    keyPrefix: row['key_prefix'] as string,
    name: row['name'] as string,
    scopes: parseJsonOr(row['scopes'] as string, ['read', 'write']),
    expiresAt: toDate(row['expires_at'] as string | null),
    lastUsedAt: toDate(row['last_used_at'] as string | null),
    active: row['active'] === 1,
    createdAt: new Date(row['created_at'] as string),
  };
}

function rowToFact(row: Record<string, unknown>): Fact {
  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    scope: row['scope'] as Fact['scope'],
    scopeId: row['scope_id'] as string,
    sessionId: (row['session_id'] as string) ?? null,
    content: row['content'] as string,
    embeddingModel: (row['embedding_model'] as string) ?? null,
    embeddingDim: (row['embedding_dim'] as number) ?? null,
    version: row['version'] as number,
    lineageId: row['lineage_id'] as string,
    validFrom: new Date(row['valid_from'] as string),
    validUntil: toDate(row['valid_until'] as string | null),
    operation: row['operation'] as Fact['operation'],
    parentId: (row['parent_id'] as string) ?? null,
    importance: row['importance'] as number,
    frequency: row['frequency'] as number,
    lastAccessed: toDate(row['last_accessed'] as string | null),
    decayScore: row['decay_score'] as number,
    contradictionStatus: row['contradiction_status'] as Fact['contradictionStatus'],
    contradictsId: (row['contradicts_id'] as string) ?? null,
    sourceType: (row['source_type'] as Fact['sourceType']) ?? null,
    sourceRef: parseJsonOr(row['source_ref'] as string | null, null),
    confidence: row['confidence'] as number,
    originalContent: (row['original_content'] as string) ?? null,
    extractionId: (row['extraction_id'] as string) ?? null,
    extractionTier: (row['extraction_tier'] as Fact['extractionTier']) ?? null,
    modality: row['modality'] as Fact['modality'],
    tags: parseJsonOr(row['tags'] as string, []),
    metadata: parseJsonOr(row['metadata'] as string, {}),
    sourceChunk: (row['source_chunk'] as string) ?? null,
    createdAt: new Date(row['created_at'] as string),
  };
}

function rowToEntity(row: Record<string, unknown>): Entity {
  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    name: row['name'] as string,
    entityType: row['entity_type'] as string,
    canonicalName: row['canonical_name'] as string,
    properties: parseJsonOr(row['properties'] as string, {}),
    embeddingModel: (row['embedding_model'] as string) ?? null,
    embeddingDim: (row['embedding_dim'] as number) ?? null,
    mergeTargetId: (row['merge_target_id'] as string) ?? null,
    createdAt: new Date(row['created_at'] as string),
    updatedAt: new Date(row['updated_at'] as string),
  };
}

function rowToEdge(row: Record<string, unknown>): Edge {
  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    sourceId: row['source_id'] as string,
    targetId: row['target_id'] as string,
    relation: row['relation'] as string,
    edgeType: row['edge_type'] as Edge['edgeType'],
    weight: row['weight'] as number,
    validFrom: new Date(row['valid_from'] as string),
    validUntil: toDate(row['valid_until'] as string | null),
    factId: (row['fact_id'] as string) ?? null,
    confidence: row['confidence'] as number,
    metadata: parseJsonOr(row['metadata'] as string, {}),
    createdAt: new Date(row['created_at'] as string),
  };
}

function rowToTrigger(row: Record<string, unknown>): Trigger {
  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    scope: row['scope'] as Trigger['scope'],
    scopeId: row['scope_id'] as string,
    condition: parseJsonOr(row['condition'] as string, {}),
    factIds: parseJsonOr(row['fact_ids'] as string, []),
    entityIds: parseJsonOr(row['entity_ids'] as string, []),
    queryTemplate: (row['query_template'] as string) ?? null,
    priority: row['priority'] as number,
    active: row['active'] === 1,
    timesFired: row['times_fired'] as number,
    lastFiredAt: toDate(row['last_fired_at'] as string | null),
    createdAt: new Date(row['created_at'] as string),
  };
}

function rowToMemoryAccess(row: Record<string, unknown>): MemoryAccess {
  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    factId: row['fact_id'] as string,
    query: row['query'] as string,
    retrievalMethod: row['retrieval_method'] as string,
    similarityScore: (row['similarity_score'] as number) ?? null,
    rankPosition: (row['rank_position'] as number) ?? null,
    wasUseful: toBool(row['was_useful'] as number | null),
    wasCorrected: row['was_corrected'] === 1,
    feedbackType: (row['feedback_type'] as MemoryAccess['feedbackType']) ?? null,
    feedbackDetail: (row['feedback_detail'] as string) ?? null,
    triggerId: (row['trigger_id'] as string) ?? null,
    accessedAt: new Date(row['accessed_at'] as string),
  };
}

function rowToExtraction(row: Record<string, unknown>): Extraction {
  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    status: row['status'] as Extraction['status'],
    inputType: row['input_type'] as Extraction['inputType'],
    inputData: parseJsonOr(row['input_data'] as string | null, row['input_data'] as string | null),
    inputHash: row['input_hash'] as string,
    inputSize: (row['input_size'] as number) ?? null,
    scope: row['scope'] as Extraction['scope'],
    scopeId: row['scope_id'] as string,
    sessionId: (row['session_id'] as string) ?? null,
    tierUsed: (row['tier_used'] as Extraction['tierUsed']) ?? null,
    llmModel: (row['llm_model'] as string) ?? null,
    factsCreated: row['facts_created'] as number,
    factsUpdated: row['facts_updated'] as number,
    factsInvalidated: row['facts_invalidated'] as number,
    entitiesCreated: row['entities_created'] as number,
    edgesCreated: row['edges_created'] as number,
    costTokensInput: row['cost_tokens_input'] as number,
    costTokensOutput: row['cost_tokens_output'] as number,
    costUsd: row['cost_usd'] as number,
    durationMs: (row['duration_ms'] as number) ?? null,
    error: (row['error'] as string) ?? null,
    retryCount: row['retry_count'] as number,
    createdAt: new Date(row['created_at'] as string),
    completedAt: toDate(row['completed_at'] as string | null),
  };
}

function rowToSession(row: Record<string, unknown>): Session {
  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    scope: row['scope'] as Session['scope'],
    scopeId: row['scope_id'] as string,
    startedAt: new Date(row['started_at'] as string),
    endedAt: toDate(row['ended_at'] as string | null),
    summary: (row['summary'] as string) ?? null,
    topics: parseJsonOr(row['topics'] as string, []),
    messageCount: row['message_count'] as number,
    factCount: row['fact_count'] as number,
    metadata: parseJsonOr(row['metadata'] as string, {}),
    createdAt: new Date(row['created_at'] as string),
  };
}

function rowToUsageRecord(row: Record<string, unknown>): UsageRecord {
  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    periodStart: new Date(row['period_start'] as string),
    periodEnd: new Date(row['period_end'] as string),
    tokensUsed: row['tokens_used'] as number,
    queriesUsed: row['queries_used'] as number,
    extractionsCount: row['extractions_count'] as number,
    costUsd: row['cost_usd'] as number,
    createdAt: new Date(row['created_at'] as string),
    updatedAt: new Date(row['updated_at'] as string),
  };
}

function rowToWebhook(row: Record<string, unknown>): Webhook {
  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    url: row['url'] as string,
    events: parseJsonOr(row['events'] as string, []),
    secretHash: row['secret_hash'] as string,
    signingKey: row['signing_key'] as string,
    active: row['active'] === 1,
    createdAt: new Date(row['created_at'] as string),
  };
}

// =============================================================================
// UUID generator (simple crypto-based)
// =============================================================================

function uuid(): string {
  return crypto.randomUUID();
}

// =============================================================================
// SQLiteStorageAdapter
// =============================================================================

export class SQLiteStorageAdapter implements StorageAdapter {
  private db: Database.Database;

  constructor(dbPath: string, config?: { embeddingDim?: number }) {
    this.db = new Database(dbPath);
    initializeDatabase(this.db, { embeddingDim: config?.embeddingDim ?? 768 });
  }

  static inMemory(config?: { embeddingDim?: number }): SQLiteStorageAdapter {
    return new SQLiteStorageAdapter(':memory:', config);
  }

  /** Expose underlying DB for advanced use / testing. */
  getDatabase(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }

  // ---------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------

  async ping(): Promise<boolean> {
    try {
      this.db.prepare('SELECT 1').get();
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Tenants
  // ---------------------------------------------------------------------------

  async createTenant(tenant: CreateTenant & { id: string }): Promise<Tenant> {
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO tenants (id, name, slug, config, plan, token_limit_monthly, query_limit_monthly,
         stripe_customer_id, stripe_subscription_id, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        tenant.id,
        tenant.name,
        tenant.slug,
        JSON.stringify(tenant.config ?? {}),
        tenant.plan ?? 'free',
        1000000,
        10000,
        null,
        null,
        1,
        ts,
        ts,
      );
    return (await this.getTenant(tenant.id))!;
  }

  async getTenant(id: string): Promise<Tenant | null> {
    const row = this.db.prepare('SELECT * FROM tenants WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return rowToTenant(row);
  }

  async getTenantBySlug(slug: string): Promise<Tenant | null> {
    const row = this.db.prepare('SELECT * FROM tenants WHERE slug = ?').get(slug) as Record<string, unknown> | undefined;
    if (!row) return null;
    return rowToTenant(row);
  }

  async updateTenant(id: string, updates: Partial<Tenant>): Promise<Tenant> {
    const existing = await this.getTenant(id);
    if (!existing) throw new Error(`Tenant ${id} not found`);

    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (updates.name !== undefined) {
      setClauses.push('name = ?');
      values.push(updates.name);
    }
    if (updates.slug !== undefined) {
      setClauses.push('slug = ?');
      values.push(updates.slug);
    }
    if (updates.config !== undefined) {
      setClauses.push('config = ?');
      values.push(JSON.stringify(updates.config));
    }
    if (updates.plan !== undefined) {
      setClauses.push('plan = ?');
      values.push(updates.plan);
    }
    if (updates.active !== undefined) {
      setClauses.push('active = ?');
      values.push(updates.active ? 1 : 0);
    }
    if (updates.tokenLimitMonthly !== undefined) {
      setClauses.push('token_limit_monthly = ?');
      values.push(updates.tokenLimitMonthly);
    }
    if (updates.queryLimitMonthly !== undefined) {
      setClauses.push('query_limit_monthly = ?');
      values.push(updates.queryLimitMonthly);
    }
    if (updates.stripeCustomerId !== undefined) {
      setClauses.push('stripe_customer_id = ?');
      values.push(updates.stripeCustomerId);
    }
    if (updates.stripeSubscriptionId !== undefined) {
      setClauses.push('stripe_subscription_id = ?');
      values.push(updates.stripeSubscriptionId);
    }

    setClauses.push('updated_at = ?');
    values.push(now());
    values.push(id);

    this.db.prepare(`UPDATE tenants SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
    return (await this.getTenant(id))!;
  }

  // ---------------------------------------------------------------------------
  // API Keys
  // ---------------------------------------------------------------------------

  async createApiKey(
    apiKey: CreateApiKey & { id: string; keyHash: string; keyPrefix: string },
  ): Promise<ApiKey> {
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO api_keys (id, tenant_id, key_hash, key_prefix, name, scopes, expires_at, last_used_at, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        apiKey.id,
        apiKey.tenantId,
        apiKey.keyHash,
        apiKey.keyPrefix,
        apiKey.name ?? 'Default',
        JSON.stringify(apiKey.scopes ?? ['read', 'write']),
        apiKey.expiresAt?.toISOString() ?? null,
        null,
        1,
        ts,
      );
    const row = this.db.prepare('SELECT * FROM api_keys WHERE id = ?').get(apiKey.id) as Record<string, unknown>;
    return rowToApiKey(row);
  }

  async getApiKeyByPrefix(prefix: string): Promise<ApiKey | null> {
    const row = this.db
      .prepare('SELECT * FROM api_keys WHERE key_prefix = ? AND active = 1')
      .get(prefix) as Record<string, unknown> | undefined;
    if (!row) return null;
    return rowToApiKey(row);
  }

  async getApiKeysForTenant(tenantId: string): Promise<ApiKey[]> {
    const rows = this.db
      .prepare('SELECT * FROM api_keys WHERE tenant_id = ?')
      .all(tenantId) as Record<string, unknown>[];
    return rows.map(rowToApiKey);
  }

  async revokeApiKey(tenantId: string, id: string): Promise<void> {
    this.db.prepare('UPDATE api_keys SET active = 0 WHERE id = ? AND tenant_id = ?').run(id, tenantId);
  }

  async updateApiKeyLastUsed(id: string): Promise<void> {
    this.db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(now(), id);
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
    const ts = now();
    const validFrom = ts;

    this.db
      .prepare(
        `INSERT INTO facts (id, tenant_id, scope, scope_id, session_id, content,
         embedding_model, embedding_dim, version, lineage_id, valid_from, valid_until,
         operation, parent_id, importance, frequency, last_accessed, decay_score,
         contradiction_status, contradicts_id, source_type, source_ref, confidence,
         original_content, extraction_id, extraction_tier, modality, tags, metadata, source_chunk, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        rest.id,
        rest.tenantId,
        rest.scope,
        rest.scopeId,
        rest.sessionId ?? null,
        rest.content,
        rest.embeddingModel ?? null,
        rest.embeddingDim ?? null,
        1,
        rest.lineageId || rest.id,
        validFrom,
        null,
        rest.operation ?? 'create',
        rest.parentId ?? null,
        rest.importance ?? 0.5,
        0,
        null,
        1.0,
        rest.contradictionStatus ?? 'none',
        rest.contradictsId ?? null,
        rest.sourceType ?? null,
        rest.sourceRef ? JSON.stringify(rest.sourceRef) : null,
        rest.confidence ?? 0.8,
        rest.originalContent ?? null,
        rest.extractionId ?? null,
        rest.extractionTier ?? null,
        rest.modality ?? 'text',
        JSON.stringify(rest.tags ?? []),
        JSON.stringify(rest.metadata ?? {}),
        rest.sourceChunk ?? null,
        ts,
      );

    // Store embedding in separate table
    if (embedding) {
      const blob = serializeEmbedding(embedding);
      this.db
        .prepare(
          `INSERT INTO fact_embeddings (fact_id, tenant_id, scope, scope_id, valid_until, embedding)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(rest.id, rest.tenantId, rest.scope, rest.scopeId, null, blob);
    }

    // Index in FTS5
    indexFact(this.db, rest.id, rest.content);

    return (await this.getFact(rest.tenantId, rest.id))!;
  }

  async getFact(tenantId: string, id: string): Promise<Fact | null> {
    const row = this.db
      .prepare('SELECT * FROM facts WHERE id = ? AND tenant_id = ?')
      .get(id, tenantId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return rowToFact(row);
  }

  async getFactsByIds(tenantId: string, ids: string[]): Promise<Fact[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const rows = this.db
      .prepare(`SELECT * FROM facts WHERE tenant_id = ? AND id IN (${placeholders})`)
      .all(tenantId, ...ids) as Record<string, unknown>[];
    return rows.map(rowToFact);
  }

  async getFactsByLineage(tenantId: string, lineageId: string): Promise<Fact[]> {
    const rows = this.db
      .prepare('SELECT * FROM facts WHERE tenant_id = ? AND lineage_id = ? ORDER BY version ASC')
      .all(tenantId, lineageId) as Record<string, unknown>[];
    return rows.map(rowToFact);
  }

  async getFactsByScope(
    tenantId: string,
    scope: string,
    scopeId: string,
    options: PaginationOptions,
  ): Promise<PaginatedResult<Fact>> {
    const { limit, cursor } = options;
    const wildcard = scopeId === '*';

    let rows: Record<string, unknown>[];
    if (cursor) {
      const cur = decodeCursor(cursor);
      if (wildcard) {
        rows = this.db
          .prepare(
            `SELECT * FROM facts WHERE tenant_id = ? AND scope = ? AND valid_until IS NULL
             AND (created_at < ? OR (created_at = ? AND id < ?))
             ORDER BY created_at DESC, id DESC LIMIT ?`,
          )
          .all(tenantId, scope, cur.ts, cur.ts, cur.id, limit + 1) as Record<string, unknown>[];
      } else {
        rows = this.db
          .prepare(
            `SELECT * FROM facts WHERE tenant_id = ? AND scope = ? AND scope_id = ? AND valid_until IS NULL
             AND (created_at < ? OR (created_at = ? AND id < ?))
             ORDER BY created_at DESC, id DESC LIMIT ?`,
          )
          .all(tenantId, scope, scopeId, cur.ts, cur.ts, cur.id, limit + 1) as Record<string, unknown>[];
      }
    } else {
      if (wildcard) {
        rows = this.db
          .prepare(
            `SELECT * FROM facts WHERE tenant_id = ? AND scope = ? AND valid_until IS NULL
             ORDER BY created_at DESC, id DESC LIMIT ?`,
          )
          .all(tenantId, scope, limit + 1) as Record<string, unknown>[];
      } else {
        rows = this.db
          .prepare(
            `SELECT * FROM facts WHERE tenant_id = ? AND scope = ? AND scope_id = ? AND valid_until IS NULL
             ORDER BY created_at DESC, id DESC LIMIT ?`,
          )
          .all(tenantId, scope, scopeId, limit + 1) as Record<string, unknown>[];
      }
    }

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const facts = page.map(rowToFact);
    const lastRow = page.length > 0 ? page[page.length - 1]! : null;
    const nextCursor =
      hasMore && lastRow ? encodeCursor(lastRow['created_at'] as string, lastRow['id'] as string) : null;

    return { data: facts, cursor: nextCursor, hasMore };
  }

  async invalidateFact(tenantId: string, id: string): Promise<void> {
    const ts = now();
    this.db.prepare('UPDATE facts SET valid_until = ? WHERE id = ? AND tenant_id = ?').run(ts, id, tenantId);
    // Update the embedding row too so vector search filters it out
    this.db.prepare('UPDATE fact_embeddings SET valid_until = ? WHERE fact_id = ?').run(ts, id);
  }

  async purgeFacts(tenantId: string, scope: string, scopeId: string): Promise<number> {
    const factRows = this.db
      .prepare('SELECT id FROM facts WHERE tenant_id = ? AND scope = ? AND scope_id = ?')
      .all(tenantId, scope, scopeId) as Array<{ id: string }>;
    if (factRows.length === 0) return 0;

    const factIds = factRows.map((r) => r.id);
    const placeholders = factIds.map(() => '?').join(',');

    this.db.transaction(() => {
      // Delete related data (cascade should handle some, but be explicit)
      this.db.prepare(`DELETE FROM fact_entities WHERE fact_id IN (${placeholders})`).run(...factIds);
      this.db.prepare(`DELETE FROM fact_embeddings WHERE fact_id IN (${placeholders})`).run(...factIds);
      // Remove from FTS5
      for (const id of factIds) {
        removeFact(this.db, id);
      }
      // Delete edges referencing these facts
      this.db.prepare(`DELETE FROM edges WHERE fact_id IN (${placeholders})`).run(...factIds);
      // Delete facts
      this.db
        .prepare('DELETE FROM facts WHERE tenant_id = ? AND scope = ? AND scope_id = ?')
        .run(tenantId, scope, scopeId);
      // Delete extraction records so dedup cache doesn't serve stale results
      this.db
        .prepare('DELETE FROM extractions WHERE tenant_id = ? AND scope = ? AND scope_id = ?')
        .run(tenantId, scope, scopeId);
    })();

    return factIds.length;
  }

  async updateDecayScores(
    tenantId: string,
    facts: Array<{ id: string; decayScore: number; lastAccessed?: Date; frequency?: number; importance?: number }>,
  ): Promise<void> {
    const stmt = this.db.prepare(
      `UPDATE facts SET decay_score = ?, last_accessed = COALESCE(?, last_accessed),
       frequency = COALESCE(?, frequency), importance = COALESCE(?, importance)
       WHERE id = ? AND tenant_id = ?`,
    );
    const updateMany = this.db.transaction(() => {
      for (const f of facts) {
        stmt.run(
          f.decayScore,
          f.lastAccessed?.toISOString() ?? null,
          f.frequency ?? null,
          f.importance ?? null,
          f.id,
          tenantId,
        );
      }
    });
    updateMany();
  }

  // ---------------------------------------------------------------------------
  // Vector search
  // ---------------------------------------------------------------------------

  async vectorSearch(options: VectorSearchOptions): Promise<VectorSearchResult[]> {
    const { embedding, tenantId, scope, scopeId, limit, minSimilarity, validOnly, asOf } = options;

    // Load matching embeddings
    let sql = `SELECT fe.fact_id, fe.embedding FROM fact_embeddings fe
               WHERE fe.tenant_id = ? AND fe.scope = ? AND fe.scope_id = ?`;
    const params: unknown[] = [tenantId, scope, scopeId];

    if (validOnly !== false) {
      // Default: only valid facts
      if (asOf) {
        sql += ` AND (fe.valid_until IS NULL OR fe.valid_until > ?)`;
        params.push(asOf.toISOString());
      } else {
        sql += ` AND fe.valid_until IS NULL`;
      }
    }

    const embRows = this.db.prepare(sql).all(...params) as Array<{ fact_id: string; embedding: Buffer }>;

    if (embRows.length === 0) return [];

    const queryVec = new Float32Array(embedding);
    const similarities: Array<{ factId: string; similarity: number }> = [];

    for (const row of embRows) {
      const storedVec = deserializeEmbedding(row.embedding);
      const sim = cosineSimilarity(queryVec, storedVec);
      if (sim >= (minSimilarity ?? 0)) {
        similarities.push({ factId: row.fact_id, similarity: sim });
      }
    }

    // Sort descending by similarity and take top-K
    similarities.sort((a, b) => b.similarity - a.similarity);
    const topK = similarities.slice(0, limit);

    if (topK.length === 0) return [];

    // Fetch full fact data
    const factIds = topK.map((s) => s.factId);
    const facts = await this.getFactsByIds(tenantId, factIds);
    const factMap = new Map(facts.map((f) => [f.id, f]));

    return topK
      .filter((s) => factMap.has(s.factId))
      .map((s) => ({
        fact: factMap.get(s.factId)!,
        similarity: s.similarity,
      }));
  }

  // ---------------------------------------------------------------------------
  // Keyword search
  // ---------------------------------------------------------------------------

  async keywordSearch(options: KeywordSearchOptions): Promise<KeywordSearchResult[]> {
    const { query, tenantId, scope, scopeId, limit, validOnly, asOf } = options;

    // Search FTS5
    const ftsResults = searchFTS(this.db, query, limit * 3); // get extra to filter by scope
    if (ftsResults.length === 0) return [];

    const factIds = ftsResults.map((r) => r.factId);
    const rankMap = new Map(ftsResults.map((r) => [r.factId, r.rank]));

    // Fetch facts and filter by scope
    const placeholders = factIds.map(() => '?').join(',');
    let sql = `SELECT * FROM facts WHERE tenant_id = ? AND scope = ? AND scope_id = ?
               AND id IN (${placeholders})`;
    const params: unknown[] = [tenantId, scope, scopeId, ...factIds];

    if (validOnly !== false) {
      if (asOf) {
        sql += ` AND (valid_until IS NULL OR valid_until > ?)`;
        params.push(asOf.toISOString());
      } else {
        sql += ` AND valid_until IS NULL`;
      }
    }

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    const facts = rows.map(rowToFact);

    // Sort by FTS rank (higher is better match)
    const results: KeywordSearchResult[] = facts.map((fact) => ({
      fact,
      rankScore: rankMap.get(fact.id) ?? 0,
    }));

    results.sort((a, b) => b.rankScore - a.rankScore);
    return results.slice(0, limit);
  }

  // ---------------------------------------------------------------------------
  // Compound search (vector + keyword in sequence; SQLite is local so this is fast)
  // ---------------------------------------------------------------------------

  async compoundSearch(options: CompoundSearchOptions): Promise<CompoundSearchResult[]> {
    const vectorResults = await this.vectorSearch({
      embedding: options.embedding,
      tenantId: options.tenantId,
      scope: options.scope,
      scopeId: options.scopeId,
      limit: options.limit,
      minSimilarity: options.minSimilarity,
      validOnly: true,
    });

    const keywordResults = await this.keywordSearch({
      query: options.query,
      tenantId: options.tenantId,
      scope: options.scope,
      scopeId: options.scopeId,
      limit: options.limit,
      validOnly: true,
    });

    return [
      ...vectorResults.map(r => ({ source: 'vector' as const, fact: r.fact, relevanceScore: r.similarity })),
      ...keywordResults.map(r => ({ source: 'keyword' as const, fact: r.fact, relevanceScore: r.rankScore })),
    ];
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
    const ts = now();

    this.db
      .prepare(
        `INSERT INTO entities (id, tenant_id, name, entity_type, canonical_name, properties,
         embedding_model, embedding_dim, merge_target_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        rest.id,
        rest.tenantId,
        rest.name,
        rest.entityType,
        rest.canonicalName,
        JSON.stringify(rest.properties ?? {}),
        rest.embeddingModel ?? null,
        rest.embeddingDim ?? null,
        null,
        ts,
        ts,
      );

    if (embedding) {
      const blob = serializeEmbedding(embedding);
      this.db
        .prepare('INSERT INTO entity_embeddings (entity_id, tenant_id, embedding) VALUES (?, ?, ?)')
        .run(rest.id, rest.tenantId, blob);
    }

    return (await this.getEntity(rest.tenantId, rest.id))!;
  }

  async getEntity(tenantId: string, id: string): Promise<Entity | null> {
    const row = this.db
      .prepare('SELECT * FROM entities WHERE id = ? AND tenant_id = ?')
      .get(id, tenantId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return rowToEntity(row);
  }

  async findEntityByCanonicalName(
    tenantId: string,
    canonicalName: string,
    entityType: string,
  ): Promise<Entity | null> {
    const row = this.db
      .prepare(
        'SELECT * FROM entities WHERE tenant_id = ? AND canonical_name = ? AND entity_type = ?',
      )
      .get(tenantId, canonicalName, entityType) as Record<string, unknown> | undefined;
    if (!row) return null;
    return rowToEntity(row);
  }

  async findEntitiesByEmbedding(
    tenantId: string,
    queryEmbedding: number[],
    limit: number,
    minSimilarity: number = 0.3,
  ): Promise<Array<{ entity: Entity; similarity: number }>> {
    // Pure-JS cosine similarity — load all entities with embeddings for this tenant
    const rows = this.db
      .prepare('SELECT * FROM entities WHERE tenant_id = ? AND embedding IS NOT NULL')
      .all(tenantId) as Record<string, unknown>[];

    const results: Array<{ entity: Entity; similarity: number }> = [];
    for (const row of rows) {
      const embStr = row['embedding'] as string | null;
      if (!embStr) continue;
      const emb = JSON.parse(embStr) as number[];
      const sim = cosineSimilarity(new Float32Array(queryEmbedding), new Float32Array(emb));
      if (sim >= minSimilarity) {
        results.push({ entity: rowToEntity(row), similarity: sim });
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  }

  async getFactsForEntities(
    _tenantId: string,
    _entityIds: string[],
    _perEntityLimit: number,
  ): Promise<Array<{ entityId: string; fact: any }>> {
    return []; // Fallback to sequential in graph-traversal.ts
  }

  async getEntitiesForTenant(
    tenantId: string,
    options: PaginationOptions,
  ): Promise<PaginatedResult<Entity>> {
    const { limit, cursor } = options;

    let rows: Record<string, unknown>[];
    if (cursor) {
      const cur = decodeCursor(cursor);
      rows = this.db
        .prepare(
          `SELECT * FROM entities WHERE tenant_id = ?
           AND (created_at > ? OR (created_at = ? AND id > ?))
           ORDER BY created_at ASC, id ASC LIMIT ?`,
        )
        .all(tenantId, cur.ts, cur.ts, cur.id, limit + 1) as Record<string, unknown>[];
    } else {
      rows = this.db
        .prepare('SELECT * FROM entities WHERE tenant_id = ? ORDER BY created_at ASC, id ASC LIMIT ?')
        .all(tenantId, limit + 1) as Record<string, unknown>[];
    }

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const entities = page.map(rowToEntity);
    const lastRow = page.length > 0 ? page[page.length - 1]! : null;
    const nextCursor =
      hasMore && lastRow ? encodeCursor(lastRow['created_at'] as string, lastRow['id'] as string) : null;

    return { data: entities, cursor: nextCursor, hasMore };
  }

  // ---------------------------------------------------------------------------
  // Fact-Entity junction
  // ---------------------------------------------------------------------------

  async linkFactEntity(factId: string, entityId: string, role: string): Promise<void> {
    this.db
      .prepare(
        'INSERT OR IGNORE INTO fact_entities (fact_id, entity_id, role, created_at) VALUES (?, ?, ?, ?)',
      )
      .run(factId, entityId, role, now());
  }

  async getEntitiesForFact(factId: string): Promise<Entity[]> {
    const rows = this.db
      .prepare(
        `SELECT e.* FROM entities e
         INNER JOIN fact_entities fe ON fe.entity_id = e.id
         WHERE fe.fact_id = ?`,
      )
      .all(factId) as Record<string, unknown>[];
    return rows.map(rowToEntity);
  }

  async getFactsForEntity(
    tenantId: string,
    entityId: string,
    options: PaginationOptions,
  ): Promise<PaginatedResult<Fact>> {
    const { limit, cursor } = options;

    let rows: Record<string, unknown>[];
    if (cursor) {
      const cur = decodeCursor(cursor);
      rows = this.db
        .prepare(
          `SELECT f.* FROM facts f
           INNER JOIN fact_entities fe ON fe.fact_id = f.id
           WHERE f.tenant_id = ? AND fe.entity_id = ?
           AND (f.created_at < ? OR (f.created_at = ? AND f.id < ?))
           ORDER BY f.created_at DESC, f.id DESC LIMIT ?`,
        )
        .all(tenantId, entityId, cur.ts, cur.ts, cur.id, limit + 1) as Record<string, unknown>[];
    } else {
      rows = this.db
        .prepare(
          `SELECT f.* FROM facts f
           INNER JOIN fact_entities fe ON fe.fact_id = f.id
           WHERE f.tenant_id = ? AND fe.entity_id = ?
           ORDER BY f.created_at DESC, f.id DESC LIMIT ?`,
        )
        .all(tenantId, entityId, limit + 1) as Record<string, unknown>[];
    }

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const facts = page.map(rowToFact);
    const lastRow = page.length > 0 ? page[page.length - 1]! : null;
    const nextCursor =
      hasMore && lastRow ? encodeCursor(lastRow['created_at'] as string, lastRow['id'] as string) : null;

    return { data: facts, cursor: nextCursor, hasMore };
  }

  // ---------------------------------------------------------------------------
  // Edges
  // ---------------------------------------------------------------------------

  async createEdge(edge: CreateEdge & { id: string }): Promise<Edge> {
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO edges (id, tenant_id, source_id, target_id, relation, edge_type,
         weight, valid_from, valid_until, fact_id, confidence, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        edge.id,
        edge.tenantId,
        edge.sourceId,
        edge.targetId,
        edge.relation,
        edge.edgeType,
        edge.weight ?? 1.0,
        ts,
        null,
        edge.factId ?? null,
        edge.confidence ?? 0.8,
        JSON.stringify(edge.metadata ?? {}),
        ts,
      );

    const row = this.db.prepare('SELECT * FROM edges WHERE id = ?').get(edge.id) as Record<string, unknown>;
    return rowToEdge(row);
  }

  async getEdgesForEntity(tenantId: string, entityId: string): Promise<Edge[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM edges WHERE tenant_id = ? AND (source_id = ? OR target_id = ?)',
      )
      .all(tenantId, entityId, entityId) as Record<string, unknown>[];
    return rows.map(rowToEdge);
  }

  async graphTraversal(options: GraphTraversalOptions): Promise<GraphTraversalResult> {
    const { tenantId, entityIds, maxDepth, maxEntities, validOnly, asOf } = options;

    // Use iterative BFS in JS since recursive CTEs with dynamic depth are tricky
    const visitedEntities = new Map<string, Entity>();
    const collectedEdges = new Map<string, Edge>();
    let frontier = [...entityIds];

    // Seed entities
    for (const eid of entityIds) {
      const entity = await this.getEntity(tenantId, eid);
      if (entity) visitedEntities.set(eid, entity);
    }

    for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
      if (visitedEntities.size >= maxEntities) break;

      const nextFrontier: string[] = [];

      for (const entityId of frontier) {
        if (visitedEntities.size >= maxEntities) break;

        let edgeRows: Record<string, unknown>[];
        if (validOnly !== false && asOf) {
          edgeRows = this.db
            .prepare(
              `SELECT * FROM edges WHERE tenant_id = ? AND (source_id = ? OR target_id = ?)
               AND (valid_until IS NULL OR valid_until > ?)`,
            )
            .all(tenantId, entityId, entityId, asOf.toISOString()) as Record<string, unknown>[];
        } else if (validOnly !== false) {
          edgeRows = this.db
            .prepare(
              `SELECT * FROM edges WHERE tenant_id = ? AND (source_id = ? OR target_id = ?)
               AND valid_until IS NULL`,
            )
            .all(tenantId, entityId, entityId) as Record<string, unknown>[];
        } else {
          edgeRows = this.db
            .prepare(
              'SELECT * FROM edges WHERE tenant_id = ? AND (source_id = ? OR target_id = ?)',
            )
            .all(tenantId, entityId, entityId) as Record<string, unknown>[];
        }

        for (const edgeRow of edgeRows) {
          const edge = rowToEdge(edgeRow);
          if (!collectedEdges.has(edge.id)) {
            collectedEdges.set(edge.id, edge);
          }

          // Find the neighbor entity
          const neighborId = edge.sourceId === entityId ? edge.targetId : edge.sourceId;
          if (!visitedEntities.has(neighborId) && visitedEntities.size < maxEntities) {
            const neighbor = await this.getEntity(tenantId, neighborId);
            if (neighbor) {
              visitedEntities.set(neighborId, neighbor);
              nextFrontier.push(neighborId);
            }
          }
        }
      }

      frontier = nextFrontier;
    }

    return {
      entities: Array.from(visitedEntities.values()),
      edges: Array.from(collectedEdges.values()),
    };
  }

  // ---------------------------------------------------------------------------
  // Triggers
  // ---------------------------------------------------------------------------

  async createTrigger(trigger: CreateTrigger & { id: string }): Promise<Trigger> {
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO triggers (id, tenant_id, scope, scope_id, condition, fact_ids, entity_ids,
         query_template, priority, active, times_fired, last_fired_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        trigger.id,
        trigger.tenantId,
        trigger.scope,
        trigger.scopeId,
        JSON.stringify(trigger.condition ?? {}),
        JSON.stringify(trigger.factIds ?? []),
        JSON.stringify(trigger.entityIds ?? []),
        trigger.queryTemplate ?? null,
        trigger.priority ?? 0,
        1,
        0,
        null,
        ts,
      );

    return (await this.getTrigger(trigger.tenantId, trigger.id))!;
  }

  async getTrigger(tenantId: string, id: string): Promise<Trigger | null> {
    const row = this.db
      .prepare('SELECT * FROM triggers WHERE id = ? AND tenant_id = ?')
      .get(id, tenantId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return rowToTrigger(row);
  }

  async getActiveTriggers(tenantId: string, scope: string, scopeId: string): Promise<Trigger[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM triggers WHERE tenant_id = ? AND scope = ? AND scope_id = ?
         AND active = 1 ORDER BY priority DESC`,
      )
      .all(tenantId, scope, scopeId) as Record<string, unknown>[];
    return rows.map(rowToTrigger);
  }

  async updateTrigger(
    tenantId: string,
    id: string,
    updates: Partial<Trigger>,
  ): Promise<Trigger> {
    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (updates.condition !== undefined) {
      setClauses.push('condition = ?');
      values.push(JSON.stringify(updates.condition));
    }
    if (updates.factIds !== undefined) {
      setClauses.push('fact_ids = ?');
      values.push(JSON.stringify(updates.factIds));
    }
    if (updates.entityIds !== undefined) {
      setClauses.push('entity_ids = ?');
      values.push(JSON.stringify(updates.entityIds));
    }
    if (updates.queryTemplate !== undefined) {
      setClauses.push('query_template = ?');
      values.push(updates.queryTemplate);
    }
    if (updates.priority !== undefined) {
      setClauses.push('priority = ?');
      values.push(updates.priority);
    }
    if (updates.active !== undefined) {
      setClauses.push('active = ?');
      values.push(updates.active ? 1 : 0);
    }
    if (updates.scope !== undefined) {
      setClauses.push('scope = ?');
      values.push(updates.scope);
    }
    if (updates.scopeId !== undefined) {
      setClauses.push('scope_id = ?');
      values.push(updates.scopeId);
    }

    if (setClauses.length === 0) {
      return (await this.getTrigger(tenantId, id))!;
    }

    values.push(id, tenantId);
    this.db
      .prepare(`UPDATE triggers SET ${setClauses.join(', ')} WHERE id = ? AND tenant_id = ?`)
      .run(...values);

    return (await this.getTrigger(tenantId, id))!;
  }

  async deleteTrigger(tenantId: string, id: string): Promise<void> {
    this.db.prepare('DELETE FROM triggers WHERE id = ? AND tenant_id = ?').run(id, tenantId);
  }

  async incrementTriggerFired(tenantId: string, id: string): Promise<void> {
    this.db
      .prepare(
        `UPDATE triggers SET times_fired = times_fired + 1, last_fired_at = ?
         WHERE id = ? AND tenant_id = ?`,
      )
      .run(now(), id, tenantId);
  }

  // ---------------------------------------------------------------------------
  // Memory Access
  // ---------------------------------------------------------------------------

  async createMemoryAccess(
    access: CreateMemoryAccess & { id: string },
  ): Promise<MemoryAccess> {
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO memory_accesses (id, tenant_id, fact_id, query, retrieval_method,
         similarity_score, rank_position, was_useful, was_corrected, feedback_type,
         feedback_detail, trigger_id, accessed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        access.id,
        access.tenantId,
        access.factId,
        access.query,
        access.retrievalMethod,
        access.similarityScore ?? null,
        access.rankPosition ?? null,
        null,
        0,
        null,
        null,
        access.triggerId ?? null,
        ts,
      );

    const row = this.db.prepare('SELECT * FROM memory_accesses WHERE id = ?').get(access.id) as Record<string, unknown>;
    return rowToMemoryAccess(row);
  }

  async updateFeedback(
    tenantId: string,
    factId: string,
    feedback: {
      wasUseful: boolean;
      feedbackType: string;
      feedbackDetail?: string;
      wasCorrected?: boolean;
    },
  ): Promise<void> {
    // Find the most recent memory access for this fact
    const row = this.db
      .prepare(
        `SELECT id FROM memory_accesses WHERE tenant_id = ? AND fact_id = ?
         ORDER BY accessed_at DESC LIMIT 1`,
      )
      .get(tenantId, factId) as { id: string } | undefined;
    if (!row) return;

    this.db
      .prepare(
        `UPDATE memory_accesses SET was_useful = ?, feedback_type = ?,
         feedback_detail = ?, was_corrected = ? WHERE id = ?`,
      )
      .run(
        fromBool(feedback.wasUseful),
        feedback.feedbackType,
        feedback.feedbackDetail ?? null,
        fromBool(feedback.wasCorrected ?? false),
        row.id,
      );
  }

  // ---------------------------------------------------------------------------
  // Extractions
  // ---------------------------------------------------------------------------

  async createExtraction(extraction: CreateExtraction & { id: string }): Promise<Extraction> {
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO extractions (id, tenant_id, status, input_type, input_data, input_hash,
         input_size, scope, scope_id, session_id, tier_used, llm_model,
         facts_created, facts_updated, facts_invalidated, entities_created, edges_created,
         cost_tokens_input, cost_tokens_output, cost_usd, duration_ms, error, retry_count,
         created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        extraction.id,
        extraction.tenantId,
        'queued',
        extraction.inputType,
        typeof extraction.inputData === 'object'
          ? JSON.stringify(extraction.inputData)
          : extraction.inputData ?? null,
        extraction.inputHash,
        extraction.inputSize ?? null,
        extraction.scope,
        extraction.scopeId,
        extraction.sessionId ?? null,
        null,
        null,
        0, 0, 0, 0, 0, 0, 0, 0,
        null, null, 0,
        ts,
        null,
      );

    return (await this.getExtraction(extraction.tenantId, extraction.id))!;
  }

  async getExtraction(tenantId: string, id: string): Promise<Extraction | null> {
    const row = this.db
      .prepare('SELECT * FROM extractions WHERE id = ? AND tenant_id = ?')
      .get(id, tenantId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return rowToExtraction(row);
  }

  async updateExtraction(
    tenantId: string,
    id: string,
    updates: Partial<Extraction>,
  ): Promise<Extraction> {
    const setClauses: string[] = [];
    const values: unknown[] = [];

    const fields: Array<[keyof Extraction, string, (v: unknown) => unknown]> = [
      ['status', 'status', (v) => v],
      ['tierUsed', 'tier_used', (v) => v],
      ['llmModel', 'llm_model', (v) => v],
      ['factsCreated', 'facts_created', (v) => v],
      ['factsUpdated', 'facts_updated', (v) => v],
      ['factsInvalidated', 'facts_invalidated', (v) => v],
      ['entitiesCreated', 'entities_created', (v) => v],
      ['edgesCreated', 'edges_created', (v) => v],
      ['costTokensInput', 'cost_tokens_input', (v) => v],
      ['costTokensOutput', 'cost_tokens_output', (v) => v],
      ['costUsd', 'cost_usd', (v) => v],
      ['durationMs', 'duration_ms', (v) => v],
      ['error', 'error', (v) => v],
      ['retryCount', 'retry_count', (v) => v],
      ['completedAt', 'completed_at', (v) => v instanceof Date ? v.toISOString() : v],
    ];

    for (const [key, col, transform] of fields) {
      if (updates[key] !== undefined) {
        setClauses.push(`${col} = ?`);
        values.push(transform(updates[key]));
      }
    }

    if (setClauses.length > 0) {
      values.push(id, tenantId);
      this.db
        .prepare(`UPDATE extractions SET ${setClauses.join(', ')} WHERE id = ? AND tenant_id = ?`)
        .run(...values);
    }

    return (await this.getExtraction(tenantId, id))!;
  }

  async getExtractionByHash(tenantId: string, inputHash: string): Promise<Extraction | null> {
    const row = this.db
      .prepare('SELECT * FROM extractions WHERE tenant_id = ? AND input_hash = ?')
      .get(tenantId, inputHash) as Record<string, unknown> | undefined;
    if (!row) return null;
    return rowToExtraction(row);
  }

  async deleteExtraction(tenantId: string, id: string): Promise<void> {
    this.db.prepare('DELETE FROM extractions WHERE tenant_id = ? AND id = ?').run(tenantId, id);
  }

  async getExtractionsByTenant(
    tenantId: string,
    options: PaginationOptions,
  ): Promise<PaginatedResult<Extraction>> {
    const { limit, cursor } = options;

    let rows: Record<string, unknown>[];
    if (cursor) {
      const cur = decodeCursor(cursor);
      rows = this.db
        .prepare(
          `SELECT * FROM extractions WHERE tenant_id = ?
           AND (created_at < ? OR (created_at = ? AND id < ?))
           ORDER BY created_at DESC, id DESC LIMIT ?`,
        )
        .all(tenantId, cur.ts, cur.ts, cur.id, limit + 1) as Record<string, unknown>[];
    } else {
      rows = this.db
        .prepare('SELECT * FROM extractions WHERE tenant_id = ? ORDER BY created_at DESC, id DESC LIMIT ?')
        .all(tenantId, limit + 1) as Record<string, unknown>[];
    }

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const extractions = page.map(rowToExtraction);
    const lastRow = page.length > 0 ? page[page.length - 1]! : null;
    const nextCursor =
      hasMore && lastRow ? encodeCursor(lastRow['created_at'] as string, lastRow['id'] as string) : null;

    return { data: extractions, cursor: nextCursor, hasMore };
  }

  // ---------------------------------------------------------------------------
  // Sessions
  // ---------------------------------------------------------------------------

  async createSession(session: CreateSession & { id: string }): Promise<Session> {
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO sessions (id, tenant_id, scope, scope_id, started_at, ended_at,
         summary, topics, message_count, fact_count, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        session.id,
        session.tenantId,
        session.scope,
        session.scopeId,
        ts,
        null,
        null,
        JSON.stringify([]),
        0,
        0,
        JSON.stringify(session.metadata ?? {}),
        ts,
      );

    return (await this.getSession(session.tenantId, session.id))!;
  }

  async getSession(tenantId: string, id: string): Promise<Session | null> {
    const row = this.db
      .prepare('SELECT * FROM sessions WHERE id = ? AND tenant_id = ?')
      .get(id, tenantId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return rowToSession(row);
  }

  async endSession(
    tenantId: string,
    id: string,
    summary?: string,
    topics?: string[],
  ): Promise<Session> {
    const setClauses = ['ended_at = ?'];
    const values: unknown[] = [now()];

    if (summary !== undefined) {
      setClauses.push('summary = ?');
      values.push(summary);
    }
    if (topics !== undefined) {
      setClauses.push('topics = ?');
      values.push(JSON.stringify(topics));
    }

    values.push(id, tenantId);
    this.db
      .prepare(`UPDATE sessions SET ${setClauses.join(', ')} WHERE id = ? AND tenant_id = ?`)
      .run(...values);

    return (await this.getSession(tenantId, id))!;
  }

  async getSessionsByScope(
    tenantId: string,
    scope: string,
    scopeId: string,
    options: PaginationOptions,
  ): Promise<PaginatedResult<Session>> {
    const { limit, cursor } = options;
    const wildcard = scopeId === '*';

    let rows: Record<string, unknown>[];
    if (cursor) {
      const cur = decodeCursor(cursor);
      if (wildcard) {
        rows = this.db
          .prepare(
            `SELECT * FROM sessions WHERE tenant_id = ? AND scope = ?
             AND (started_at < ? OR (started_at = ? AND id < ?))
             ORDER BY started_at DESC, id DESC LIMIT ?`,
          )
          .all(tenantId, scope, cur.ts, cur.ts, cur.id, limit + 1) as Record<string, unknown>[];
      } else {
        rows = this.db
          .prepare(
            `SELECT * FROM sessions WHERE tenant_id = ? AND scope = ? AND scope_id = ?
             AND (started_at < ? OR (started_at = ? AND id < ?))
             ORDER BY started_at DESC, id DESC LIMIT ?`,
          )
          .all(tenantId, scope, scopeId, cur.ts, cur.ts, cur.id, limit + 1) as Record<string, unknown>[];
      }
    } else {
      if (wildcard) {
        rows = this.db
          .prepare(
            `SELECT * FROM sessions WHERE tenant_id = ? AND scope = ?
             ORDER BY started_at DESC, id DESC LIMIT ?`,
          )
          .all(tenantId, scope, limit + 1) as Record<string, unknown>[];
      } else {
        rows = this.db
          .prepare(
            `SELECT * FROM sessions WHERE tenant_id = ? AND scope = ? AND scope_id = ?
             ORDER BY started_at DESC, id DESC LIMIT ?`,
          )
          .all(tenantId, scope, scopeId, limit + 1) as Record<string, unknown>[];
      }
    }

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const sessions = page.map(rowToSession);
    const lastRow = page.length > 0 ? page[page.length - 1]! : null;
    const nextCursor =
      hasMore && lastRow ? encodeCursor(lastRow['started_at'] as string, lastRow['id'] as string) : null;

    return { data: sessions, cursor: nextCursor, hasMore };
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
    const n = new Date();
    const periodStart = new Date(n.getFullYear(), n.getMonth(), 1).toISOString();
    const periodEnd = new Date(n.getFullYear(), n.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
    const ts = now();
    const id = uuid();

    this.db
      .prepare(
        `INSERT INTO usage_records (id, tenant_id, period_start, period_end, tokens_used, queries_used,
         extractions_count, cost_usd, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (tenant_id, period_start) DO UPDATE SET
           tokens_used = tokens_used + excluded.tokens_used,
           queries_used = queries_used + excluded.queries_used,
           extractions_count = extractions_count + excluded.extractions_count,
           cost_usd = cost_usd + excluded.cost_usd,
           updated_at = excluded.updated_at`,
      )
      .run(id, tenantId, periodStart, periodEnd, tokens, queries, extractions, costUsd, ts, ts);
  }

  async getUsage(tenantId: string, periodStart: Date): Promise<UsageRecord | null> {
    const row = this.db
      .prepare('SELECT * FROM usage_records WHERE tenant_id = ? AND period_start = ?')
      .get(tenantId, periodStart.toISOString()) as Record<string, unknown> | undefined;
    if (!row) return null;
    return rowToUsageRecord(row);
  }

  async getCurrentUsage(tenantId: string): Promise<UsageRecord | null> {
    const n = new Date();
    const periodStart = new Date(n.getFullYear(), n.getMonth(), 1);
    return this.getUsage(tenantId, periodStart);
  }

  // ---------------------------------------------------------------------------
  // Webhooks
  // ---------------------------------------------------------------------------

  async createWebhook(
    webhook: CreateWebhook & { id: string; secretHash: string; signingKey: string },
  ): Promise<Webhook> {
    const ts = now();
    // Strip `secret` — it's on CreateWebhook but not a DB column
    const { secret: _secret, ...rest } = webhook;
    this.db
      .prepare(
        `INSERT INTO webhooks (id, tenant_id, url, events, secret_hash, signing_key, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        rest.id,
        rest.tenantId,
        rest.url,
        JSON.stringify(rest.events ?? []),
        rest.secretHash,
        rest.signingKey,
        1,
        ts,
      );

    return (await this.getWebhook(rest.tenantId, rest.id))!;
  }

  async getWebhook(tenantId: string, id: string): Promise<Webhook | null> {
    const row = this.db
      .prepare('SELECT * FROM webhooks WHERE id = ? AND tenant_id = ?')
      .get(id, tenantId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return rowToWebhook(row);
  }

  async getWebhooksForTenant(tenantId: string): Promise<Webhook[]> {
    const rows = this.db
      .prepare('SELECT * FROM webhooks WHERE tenant_id = ?')
      .all(tenantId) as Record<string, unknown>[];
    return rows.map(rowToWebhook);
  }

  async getWebhooksByEvent(tenantId: string, event: string): Promise<Webhook[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM webhooks WHERE tenant_id = ? AND active = 1',
      )
      .all(tenantId) as Record<string, unknown>[];

    return rows.filter((row) => {
      const events = parseJsonOr<string[]>(row['events'] as string, []);
      return events.includes(event);
    }).map(rowToWebhook);
  }

  async deleteWebhook(tenantId: string, id: string): Promise<void> {
    this.db.prepare('DELETE FROM webhooks WHERE id = ? AND tenant_id = ?').run(id, tenantId);
  }
}

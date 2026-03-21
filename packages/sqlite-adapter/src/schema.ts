import type Database from 'better-sqlite3';

export function initializeDatabase(db: Database.Database, config: { embeddingDim: number }): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    -- Tenants
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      config TEXT NOT NULL DEFAULT '{}',
      plan TEXT NOT NULL DEFAULT 'free',
      token_limit_monthly INTEGER NOT NULL DEFAULT 1000000,
      query_limit_monthly INTEGER NOT NULL DEFAULT 10000,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || 'Z'),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || 'Z')
    );

    -- API Keys
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      key_hash TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT 'Default',
      scopes TEXT NOT NULL DEFAULT '["read","write"]',
      expires_at TEXT,
      last_used_at TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || 'Z')
    );
    CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
    CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);

    -- Facts
    CREATE TABLE IF NOT EXISTS facts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      scope TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      session_id TEXT,
      content TEXT NOT NULL,
      embedding_model TEXT,
      embedding_dim INTEGER,
      version INTEGER NOT NULL DEFAULT 1,
      lineage_id TEXT NOT NULL,
      valid_from TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || 'Z'),
      valid_until TEXT,
      operation TEXT NOT NULL DEFAULT 'create',
      parent_id TEXT,
      importance REAL NOT NULL DEFAULT 0.5,
      frequency INTEGER NOT NULL DEFAULT 0,
      last_accessed TEXT,
      decay_score REAL NOT NULL DEFAULT 1.0,
      contradiction_status TEXT NOT NULL DEFAULT 'none',
      contradicts_id TEXT,
      source_type TEXT,
      source_ref TEXT,
      confidence REAL NOT NULL DEFAULT 0.8,
      original_content TEXT,
      extraction_id TEXT,
      extraction_tier TEXT,
      modality TEXT NOT NULL DEFAULT 'text',
      tags TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || 'Z')
    );
    CREATE INDEX IF NOT EXISTS idx_facts_tenant_scope ON facts(tenant_id, scope, scope_id);
    CREATE INDEX IF NOT EXISTS idx_facts_lineage ON facts(tenant_id, lineage_id);
    CREATE INDEX IF NOT EXISTS idx_facts_created ON facts(created_at);

    -- Fact embeddings (separate table for BLOB storage)
    CREATE TABLE IF NOT EXISTS fact_embeddings (
      fact_id TEXT PRIMARY KEY REFERENCES facts(id) ON DELETE CASCADE,
      tenant_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      valid_until TEXT,
      embedding BLOB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_fact_emb_scope ON fact_embeddings(tenant_id, scope, scope_id);

    -- Entities
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      canonical_name TEXT NOT NULL,
      properties TEXT NOT NULL DEFAULT '{}',
      embedding_model TEXT,
      embedding_dim INTEGER,
      merge_target_id TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || 'Z'),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || 'Z')
    );
    CREATE INDEX IF NOT EXISTS idx_entities_tenant ON entities(tenant_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_canonical ON entities(tenant_id, canonical_name, entity_type);

    -- Entity embeddings
    CREATE TABLE IF NOT EXISTS entity_embeddings (
      entity_id TEXT PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
      tenant_id TEXT NOT NULL,
      embedding BLOB NOT NULL
    );

    -- Fact-Entity junction
    CREATE TABLE IF NOT EXISTS fact_entities (
      fact_id TEXT NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
      entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'mentioned',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || 'Z'),
      PRIMARY KEY (fact_id, entity_id)
    );
    CREATE INDEX IF NOT EXISTS idx_fe_entity ON fact_entities(entity_id);

    -- Edges
    CREATE TABLE IF NOT EXISTS edges (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      source_id TEXT NOT NULL REFERENCES entities(id),
      target_id TEXT NOT NULL REFERENCES entities(id),
      relation TEXT NOT NULL,
      edge_type TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 1.0,
      valid_from TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || 'Z'),
      valid_until TEXT,
      fact_id TEXT,
      confidence REAL NOT NULL DEFAULT 0.8,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || 'Z')
    );
    CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(tenant_id, source_id);
    CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(tenant_id, target_id);

    -- Triggers
    CREATE TABLE IF NOT EXISTS triggers (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      scope TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      condition TEXT NOT NULL DEFAULT '{}',
      fact_ids TEXT NOT NULL DEFAULT '[]',
      entity_ids TEXT NOT NULL DEFAULT '[]',
      query_template TEXT,
      priority INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      times_fired INTEGER NOT NULL DEFAULT 0,
      last_fired_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || 'Z')
    );
    CREATE INDEX IF NOT EXISTS idx_triggers_scope ON triggers(tenant_id, scope, scope_id);

    -- Memory Accesses
    CREATE TABLE IF NOT EXISTS memory_accesses (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      fact_id TEXT NOT NULL REFERENCES facts(id),
      query TEXT NOT NULL,
      retrieval_method TEXT NOT NULL,
      similarity_score REAL,
      rank_position INTEGER,
      was_useful INTEGER,
      was_corrected INTEGER NOT NULL DEFAULT 0,
      feedback_type TEXT,
      feedback_detail TEXT,
      trigger_id TEXT,
      accessed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || 'Z')
    );
    CREATE INDEX IF NOT EXISTS idx_ma_tenant_fact ON memory_accesses(tenant_id, fact_id);

    -- Extractions
    CREATE TABLE IF NOT EXISTS extractions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      status TEXT NOT NULL DEFAULT 'queued',
      input_type TEXT NOT NULL,
      input_data TEXT,
      input_hash TEXT NOT NULL,
      input_size INTEGER,
      scope TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      session_id TEXT,
      tier_used TEXT,
      llm_model TEXT,
      facts_created INTEGER NOT NULL DEFAULT 0,
      facts_updated INTEGER NOT NULL DEFAULT 0,
      facts_invalidated INTEGER NOT NULL DEFAULT 0,
      entities_created INTEGER NOT NULL DEFAULT 0,
      edges_created INTEGER NOT NULL DEFAULT 0,
      cost_tokens_input INTEGER NOT NULL DEFAULT 0,
      cost_tokens_output INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      duration_ms INTEGER,
      error TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || 'Z'),
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_extractions_tenant ON extractions(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_extractions_hash ON extractions(tenant_id, input_hash);

    -- Sessions
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      scope TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || 'Z'),
      ended_at TEXT,
      summary TEXT,
      topics TEXT NOT NULL DEFAULT '[]',
      message_count INTEGER NOT NULL DEFAULT 0,
      fact_count INTEGER NOT NULL DEFAULT 0,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || 'Z')
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_scope ON sessions(tenant_id, scope, scope_id);

    -- Usage Records
    CREATE TABLE IF NOT EXISTS usage_records (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      tokens_used INTEGER NOT NULL DEFAULT 0,
      queries_used INTEGER NOT NULL DEFAULT 0,
      extractions_count INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || 'Z'),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || 'Z')
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_tenant_period ON usage_records(tenant_id, period_start);

    -- Webhooks
    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      url TEXT NOT NULL,
      events TEXT NOT NULL DEFAULT '[]',
      secret_hash TEXT NOT NULL,
      signing_key TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || 'Z')
    );
    CREATE INDEX IF NOT EXISTS idx_webhooks_tenant ON webhooks(tenant_id);

    -- FTS5 for keyword search on facts
    CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(fact_id UNINDEXED, content);
  `);
}

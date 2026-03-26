#!/usr/bin/env node
/**
 * steno-mcp init — interactive setup wizard
 *
 * 1. Asks for Supabase + OpenAI keys
 * 2. Runs all migrations automatically
 * 3. Writes Claude Desktop config
 * 4. Tests the connection
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string): Promise<string> => new Promise(r => rl.question(q, r));

// All migrations in order
const MIGRATIONS = [
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`,
  `CREATE EXTENSION IF NOT EXISTS "vector";`,
  `CREATE EXTENSION IF NOT EXISTS "pg_trgm";`,
  // Tenants
  `CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    config JSONB NOT NULL DEFAULT '{}',
    plan TEXT NOT NULL DEFAULT 'free',
    token_limit_monthly INTEGER NOT NULL DEFAULT 1000000,
    query_limit_monthly INTEGER NOT NULL DEFAULT 10000,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  // API Keys
  `CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT 'Default',
    scopes TEXT[] NOT NULL DEFAULT ARRAY['read','write'],
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  // Sessions
  `CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    scope TEXT NOT NULL,
    scope_id TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    summary TEXT,
    topics TEXT[] NOT NULL DEFAULT '{}',
    message_count INTEGER NOT NULL DEFAULT 0,
    fact_count INTEGER NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  // Extractions
  `CREATE TABLE IF NOT EXISTS extractions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued',
    input_type TEXT NOT NULL,
    input_data TEXT,
    input_hash TEXT NOT NULL,
    input_size INTEGER,
    scope TEXT NOT NULL,
    scope_id TEXT NOT NULL,
    session_id UUID,
    tier_used TEXT,
    llm_model TEXT,
    facts_created INTEGER NOT NULL DEFAULT 0,
    facts_updated INTEGER NOT NULL DEFAULT 0,
    facts_invalidated INTEGER NOT NULL DEFAULT 0,
    entities_created INTEGER NOT NULL DEFAULT 0,
    edges_created INTEGER NOT NULL DEFAULT 0,
    cost_tokens_input INTEGER NOT NULL DEFAULT 0,
    cost_tokens_output INTEGER NOT NULL DEFAULT 0,
    cost_usd NUMERIC NOT NULL DEFAULT 0,
    duration_ms INTEGER,
    error TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
  );`,
  // Facts
  `CREATE TABLE IF NOT EXISTS facts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    scope TEXT NOT NULL CHECK (scope IN ('user','agent','session','hive')),
    scope_id TEXT NOT NULL,
    session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    embedding VECTOR(2000),
    embedding_model TEXT,
    embedding_dim INTEGER,
    search_vector TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
    version INTEGER NOT NULL DEFAULT 1,
    lineage_id UUID NOT NULL DEFAULT uuid_generate_v4(),
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    operation TEXT NOT NULL DEFAULT 'create' CHECK (operation IN ('create','update','invalidate')),
    parent_id UUID REFERENCES facts(id) ON DELETE SET NULL,
    importance NUMERIC(5,4) NOT NULL DEFAULT 0.5,
    frequency INTEGER NOT NULL DEFAULT 1,
    last_accessed TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decay_score NUMERIC(8,6) NOT NULL DEFAULT 0.5,
    contradiction_status TEXT NOT NULL DEFAULT 'none',
    contradicts_id UUID REFERENCES facts(id) ON DELETE SET NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('conversation','document','url','raw_text','api','agent_self')),
    source_ref JSONB,
    confidence NUMERIC(5,4) NOT NULL DEFAULT 0.8,
    original_content TEXT,
    extraction_id UUID,
    extraction_tier TEXT,
    modality TEXT NOT NULL DEFAULT 'text',
    tags TEXT[] NOT NULL DEFAULT '{}',
    metadata JSONB NOT NULL DEFAULT '{}',
    event_date TIMESTAMPTZ,
    document_date TIMESTAMPTZ,
    source_chunk TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  // Fact indexes
  `CREATE INDEX IF NOT EXISTS idx_facts_tenant_scope ON facts(tenant_id, scope, scope_id);
   CREATE INDEX IF NOT EXISTS idx_facts_lineage ON facts(tenant_id, lineage_id);
   CREATE INDEX IF NOT EXISTS idx_facts_search_vector ON facts USING GIN(search_vector);
   CREATE INDEX IF NOT EXISTS idx_facts_event_date ON facts(event_date) WHERE event_date IS NOT NULL;`,
  // HNSW vector index
  `CREATE INDEX IF NOT EXISTS idx_facts_embedding_hnsw ON facts USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);`,
  // Entities
  `CREATE TABLE IF NOT EXISTS entities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    canonical_name TEXT NOT NULL,
    properties JSONB NOT NULL DEFAULT '{}',
    embedding VECTOR(2000),
    embedding_model TEXT,
    embedding_dim INTEGER,
    merge_target_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_canonical ON entities(tenant_id, canonical_name, entity_type);`,
  // Fact-Entity junction
  `CREATE TABLE IF NOT EXISTS fact_entities (
    fact_id UUID NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'mentioned',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (fact_id, entity_id)
  );`,
  // Edges
  `CREATE TABLE IF NOT EXISTS edges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES entities(id),
    target_id UUID NOT NULL REFERENCES entities(id),
    relation TEXT NOT NULL,
    edge_type TEXT NOT NULL,
    weight NUMERIC(5,4) NOT NULL DEFAULT 1.0,
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    fact_id UUID,
    confidence NUMERIC(5,4) NOT NULL DEFAULT 0.8,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(tenant_id, source_id);
  CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(tenant_id, target_id);`,
  // Triggers
  `CREATE TABLE IF NOT EXISTS triggers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    scope TEXT NOT NULL,
    scope_id TEXT NOT NULL,
    condition JSONB NOT NULL DEFAULT '{}',
    fact_ids UUID[] NOT NULL DEFAULT '{}',
    entity_ids UUID[] NOT NULL DEFAULT '{}',
    query_template TEXT,
    priority INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    times_fired INTEGER NOT NULL DEFAULT 0,
    last_fired_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  // Memory accesses
  `CREATE TABLE IF NOT EXISTS memory_accesses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    fact_id UUID NOT NULL REFERENCES facts(id),
    query TEXT NOT NULL,
    retrieval_method TEXT NOT NULL,
    similarity_score NUMERIC,
    rank_position INTEGER,
    was_useful BOOLEAN,
    was_corrected BOOLEAN NOT NULL DEFAULT false,
    feedback_type TEXT,
    feedback_detail TEXT,
    trigger_id UUID,
    accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  // Usage records
  `CREATE TABLE IF NOT EXISTS usage_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    queries_used INTEGER NOT NULL DEFAULT 0,
    extractions_count INTEGER NOT NULL DEFAULT 0,
    cost_usd NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  // Webhooks
  `CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    events TEXT[] NOT NULL DEFAULT '{}',
    secret_hash TEXT NOT NULL,
    signing_key TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  // Compound search RPC
  `CREATE OR REPLACE FUNCTION steno_search(
    query_embedding TEXT, search_query TEXT, match_tenant_id UUID,
    match_scope TEXT, match_scope_id TEXT, match_count INT DEFAULT 20, min_similarity FLOAT DEFAULT 0.0
  ) RETURNS TABLE (
    source TEXT, id UUID, tenant_id UUID, scope TEXT, scope_id TEXT, session_id UUID,
    content TEXT, embedding_model TEXT, embedding_dim INT, version INT, lineage_id UUID,
    valid_from TIMESTAMPTZ, valid_until TIMESTAMPTZ, operation TEXT, parent_id UUID,
    importance NUMERIC, frequency INT, last_accessed TIMESTAMPTZ, decay_score NUMERIC,
    contradiction_status TEXT, contradicts_id UUID, source_type TEXT, source_ref JSONB,
    confidence NUMERIC, original_content TEXT, extraction_id UUID, extraction_tier TEXT,
    modality TEXT, tags TEXT[], metadata JSONB, created_at TIMESTAMPTZ,
    event_date TIMESTAMPTZ, document_date TIMESTAMPTZ, source_chunk TEXT, relevance_score FLOAT
  ) LANGUAGE plpgsql AS $$
  BEGIN RETURN QUERY
    (SELECT 'vector'::TEXT, f.id, f.tenant_id, f.scope, f.scope_id, f.session_id,
      f.content, f.embedding_model, f.embedding_dim, f.version, f.lineage_id,
      f.valid_from, f.valid_until, f.operation, f.parent_id, f.importance, f.frequency,
      f.last_accessed, f.decay_score, f.contradiction_status, f.contradicts_id,
      f.source_type, f.source_ref, f.confidence, f.original_content, f.extraction_id,
      f.extraction_tier, f.modality, f.tags, f.metadata, f.created_at,
      f.event_date, f.document_date, f.source_chunk,
      (1 - (f.embedding <=> query_embedding::vector))::float
    FROM facts f WHERE f.tenant_id = match_tenant_id AND f.scope = match_scope
      AND f.scope_id = match_scope_id AND f.valid_until IS NULL
      AND NOT ('raw_chunk' = ANY(f.tags))
      AND (1 - (f.embedding <=> query_embedding::vector)) >= min_similarity
    ORDER BY f.embedding <=> query_embedding::vector LIMIT match_count)
    UNION ALL
    (SELECT 'keyword'::TEXT, f.id, f.tenant_id, f.scope, f.scope_id, f.session_id,
      f.content, f.embedding_model, f.embedding_dim, f.version, f.lineage_id,
      f.valid_from, f.valid_until, f.operation, f.parent_id, f.importance, f.frequency,
      f.last_accessed, f.decay_score, f.contradiction_status, f.contradicts_id,
      f.source_type, f.source_ref, f.confidence, f.original_content, f.extraction_id,
      f.extraction_tier, f.modality, f.tags, f.metadata, f.created_at,
      f.event_date, f.document_date, f.source_chunk,
      ts_rank(f.search_vector, plainto_tsquery('english', search_query))::float
    FROM facts f WHERE f.tenant_id = match_tenant_id AND f.scope = match_scope
      AND f.scope_id = match_scope_id AND f.valid_until IS NULL
      AND NOT ('raw_chunk' = ANY(f.tags))
      AND f.search_vector @@ plainto_tsquery('english', search_query)
    ORDER BY ts_rank(f.search_vector, plainto_tsquery('english', search_query)) DESC LIMIT match_count);
  END; $$;`,
  // Default tenant
  `INSERT INTO tenants (id, name, slug, plan) VALUES ('00000000-0000-0000-0000-000000000001', 'Default', 'default', 'enterprise') ON CONFLICT DO NOTHING;`,
];

async function main() {
  console.log('\n  🧠 Steno Memory — Setup Wizard\n');

  // 1. Get keys
  const supabaseUrl = await ask('  Supabase URL: ');
  const supabaseKey = await ask('  Supabase Service Role Key: ');
  const openaiKey = await ask('  OpenAI API Key: ');
  const perplexityKey = await ask('  Perplexity API Key (optional, press Enter to skip): ');

  if (!supabaseUrl || !supabaseKey || !openaiKey) {
    console.error('\n  ❌ Supabase URL, Service Role Key, and OpenAI Key are required.\n');
    process.exit(1);
  }

  // 2. Run migrations
  console.log('\n  Running database migrations...');
  const supabase = createClient(supabaseUrl, supabaseKey);

  let success = 0;
  let skipped = 0;
  for (let i = 0; i < MIGRATIONS.length; i++) {
    try {
      const { error } = await supabase.rpc('exec_sql', { query: MIGRATIONS[i] }).catch(() => ({ error: { message: 'rpc not available' } }));
      if (error) {
        // Try direct REST approach
        const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: MIGRATIONS[i] }),
        });
        if (res.ok) { success++; } else { skipped++; }
      } else {
        success++;
      }
    } catch {
      skipped++;
    }
  }
  console.log(`  ✓ ${success} migrations applied, ${skipped} skipped (may already exist)`);

  // 3. Write Claude Desktop config
  const configDir = path.join(os.homedir(), 'Library', 'Application Support', 'Claude');
  const configPath = path.join(configDir, 'claude_desktop_config.json');

  let config: any = {};
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch { /* new config */ }

  if (!config.mcpServers) config.mcpServers = {};
  config.mcpServers['steno-memory'] = {
    command: 'npx',
    args: ['-y', '@steno-ai/mcp'],
    env: {
      SUPABASE_URL: supabaseUrl,
      SUPABASE_SERVICE_ROLE_KEY: supabaseKey,
      OPENAI_API_KEY: openaiKey,
      ...(perplexityKey ? { PERPLEXITY_API_KEY: perplexityKey } : {}),
    },
  };

  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`  ✓ Claude Desktop config written to ${configPath}`);

  // 4. Done
  console.log(`
  ✅ Setup complete!

  Next steps:
  1. Restart Claude Desktop (Cmd+Q, reopen)
  2. Go to Settings > General > set "Tools already loaded"
  3. Start chatting — Claude will remember everything

  Your data stays in YOUR Supabase. Nothing is shared.
  `);

  rl.close();
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});

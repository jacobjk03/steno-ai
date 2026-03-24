-- =============================================================================
-- Steno AI Memory System — Complete Database Schema
-- =============================================================================
-- Embedding dimension placeholder: {EMBEDDING_DIM}
-- Replace at migration time, e.g.: sed 's/{EMBEDDING_DIM}/1536/g' schema.sql
-- =============================================================================

-- Required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =============================================================================
-- 1. tenants
-- =============================================================================
CREATE TABLE tenants (
    id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                    TEXT        NOT NULL,
    slug                    TEXT        NOT NULL UNIQUE,
    config                  JSONB       NOT NULL DEFAULT '{}',
    plan                    TEXT        NOT NULL DEFAULT 'free',
    token_limit_monthly     BIGINT      NOT NULL DEFAULT 1000000,
    query_limit_monthly     BIGINT      NOT NULL DEFAULT 10000,
    stripe_customer_id      TEXT,
    stripe_subscription_id  TEXT,
    active                  BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 2. api_keys
-- =============================================================================
CREATE TABLE api_keys (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key_hash     TEXT        NOT NULL,
    key_prefix   TEXT        NOT NULL,
    name         TEXT        NOT NULL DEFAULT 'Default',
    scopes       TEXT[]      NOT NULL DEFAULT ARRAY['read','write'],
    expires_at   TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 3. sessions
-- =============================================================================
CREATE TABLE sessions (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    scope         TEXT        NOT NULL CHECK (scope IN ('user', 'agent', 'hive')),
    scope_id      TEXT        NOT NULL,
    started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at      TIMESTAMPTZ,
    summary       TEXT,
    topics        TEXT[]      NOT NULL DEFAULT '{}',
    message_count INTEGER     NOT NULL DEFAULT 0,
    fact_count    INTEGER     NOT NULL DEFAULT 0,
    metadata      JSONB       NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 4. extractions
-- =============================================================================
CREATE TABLE extractions (
    id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    status                TEXT        NOT NULL DEFAULT 'queued'
                                      CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'deduped')),
    input_type            TEXT        NOT NULL CHECK (input_type IN ('conversation', 'document', 'url', 'raw_text', 'image', 'audio', 'code')),
    input_data            TEXT        NOT NULL,
    input_hash            TEXT        NOT NULL,
    input_size            INTEGER     NOT NULL DEFAULT 0,
    scope                 TEXT        NOT NULL CHECK (scope IN ('user', 'agent', 'session', 'hive')),
    scope_id              TEXT        NOT NULL,
    session_id            UUID        REFERENCES sessions(id) ON DELETE SET NULL,
    tier_used             TEXT,
    llm_model             TEXT,
    facts_created         INTEGER     NOT NULL DEFAULT 0,
    facts_updated         INTEGER     NOT NULL DEFAULT 0,
    facts_invalidated     INTEGER     NOT NULL DEFAULT 0,
    entities_created      INTEGER     NOT NULL DEFAULT 0,
    edges_created         INTEGER     NOT NULL DEFAULT 0,
    cost_tokens_input     BIGINT      NOT NULL DEFAULT 0,
    cost_tokens_output    BIGINT      NOT NULL DEFAULT 0,
    cost_usd              NUMERIC(12, 6) NOT NULL DEFAULT 0,
    duration_ms           INTEGER,
    error                 TEXT,
    retry_count           INTEGER     NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at          TIMESTAMPTZ,
    UNIQUE (tenant_id, input_hash)
);

-- =============================================================================
-- 5. facts
-- =============================================================================
CREATE TABLE facts (
    id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    scope                 TEXT        NOT NULL CHECK (scope IN ('user', 'agent', 'session', 'hive')),
    scope_id              TEXT        NOT NULL,
    session_id            UUID        REFERENCES sessions(id) ON DELETE SET NULL,
    content               TEXT        NOT NULL,
    embedding             VECTOR({EMBEDDING_DIM}),
    embedding_model       TEXT,
    embedding_dim         INTEGER,
    search_vector         TSVECTOR    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
    version               INTEGER     NOT NULL DEFAULT 1,
    lineage_id            UUID        NOT NULL DEFAULT uuid_generate_v4(),
    valid_from            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until           TIMESTAMPTZ,
    operation             TEXT        NOT NULL DEFAULT 'create' CHECK (operation IN ('create', 'update', 'invalidate')),
    parent_id             UUID        REFERENCES facts(id) ON DELETE SET NULL,
    importance            NUMERIC(5, 4) NOT NULL DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),
    frequency             INTEGER     NOT NULL DEFAULT 1,
    last_accessed         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decay_score           NUMERIC(8, 6) NOT NULL DEFAULT 0.5,
    contradiction_status  TEXT        NOT NULL DEFAULT 'none' CHECK (contradiction_status IN ('none', 'active', 'resolved', 'superseded')),
    contradicts_id        UUID        REFERENCES facts(id) ON DELETE SET NULL,
    source_type           TEXT        NOT NULL CHECK (source_type IN ('conversation', 'document', 'url', 'raw_text', 'api', 'agent_self')),
    source_ref            JSONB,
    confidence            NUMERIC(5, 4) NOT NULL DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
    original_content      TEXT,
    -- extraction_id: intentionally no FK; enforced at application level
    extraction_id         UUID,
    extraction_tier       TEXT        CHECK (extraction_tier IN ('heuristic', 'cheap_llm', 'smart_llm')),
    modality              TEXT        NOT NULL DEFAULT 'text' CHECK (modality IN ('text', 'image', 'audio', 'code', 'document')),
    tags                  TEXT[]      NOT NULL DEFAULT '{}',
    metadata              JSONB       NOT NULL DEFAULT '{}',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 6. entities
-- =============================================================================
CREATE TABLE entities (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name             TEXT        NOT NULL,
    entity_type      TEXT        NOT NULL,
    canonical_name   TEXT        NOT NULL,
    properties       JSONB       NOT NULL DEFAULT '{}',
    embedding        VECTOR({EMBEDDING_DIM}),
    embedding_model  TEXT,
    embedding_dim    INTEGER,
    merge_target_id  UUID        REFERENCES entities(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, canonical_name, entity_type)
);

-- =============================================================================
-- 7. fact_entities
-- =============================================================================
CREATE TABLE fact_entities (
    fact_id    UUID        NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
    entity_id  UUID        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    role       TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (fact_id, entity_id)
);

-- =============================================================================
-- 8. edges
-- =============================================================================
CREATE TABLE edges (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_id   UUID        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    target_id   UUID        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    relation    TEXT        NOT NULL,
    edge_type   TEXT        NOT NULL CHECK (edge_type IN ('associative', 'causal', 'temporal', 'contradictory', 'hierarchical')),
    weight      NUMERIC(5, 4) NOT NULL DEFAULT 1.0 CHECK (weight >= 0),
    valid_from  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    fact_id     UUID        REFERENCES facts(id) ON DELETE SET NULL,
    confidence  NUMERIC(5, 4) NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
    metadata    JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 9. triggers
-- =============================================================================
CREATE TABLE triggers (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    scope          TEXT        NOT NULL CHECK (scope IN ('user', 'agent', 'session', 'hive')),
    scope_id       TEXT        NOT NULL,
    condition      JSONB       NOT NULL DEFAULT '{}',
    fact_ids       UUID[]      NOT NULL DEFAULT '{}',
    entity_ids     UUID[]      NOT NULL DEFAULT '{}',
    query_template TEXT,
    priority       INTEGER     NOT NULL DEFAULT 0,
    active         BOOLEAN     NOT NULL DEFAULT TRUE,
    times_fired    INTEGER     NOT NULL DEFAULT 0,
    last_fired_at  TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 10. memory_accesses
-- =============================================================================
CREATE TABLE memory_accesses (
    id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    fact_id           UUID        NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
    query             TEXT        NOT NULL,
    retrieval_method  TEXT        NOT NULL,
    similarity_score  NUMERIC(8, 6),
    rank_position     INTEGER,
    was_useful        BOOLEAN,
    was_corrected     BOOLEAN     NOT NULL DEFAULT FALSE,
    feedback_type     TEXT        CHECK (feedback_type IN ('implicit_positive', 'implicit_negative', 'explicit_positive', 'explicit_negative', 'correction')),
    feedback_detail   TEXT,
    trigger_id        UUID        REFERENCES triggers(id) ON DELETE SET NULL,
    accessed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 11. usage_records
-- =============================================================================
CREATE TABLE usage_records (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    period_start        DATE        NOT NULL,
    period_end          DATE        NOT NULL,
    tokens_used         BIGINT      NOT NULL DEFAULT 0,
    queries_used        BIGINT      NOT NULL DEFAULT 0,
    extractions_count   BIGINT      NOT NULL DEFAULT 0,
    cost_usd            NUMERIC(12, 6) NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, period_start)
);

-- =============================================================================
-- 12. webhooks
-- =============================================================================
CREATE TABLE webhooks (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID        NOT NULL REFERENCES tenants(id),
    url             TEXT        NOT NULL,
    events          TEXT[]      NOT NULL,
    secret_hash     TEXT        NOT NULL,
    active          BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- HNSW vector indexes (approximate nearest neighbour search)
CREATE INDEX idx_facts_embedding_hnsw
    ON facts USING hnsw (embedding vector_cosine_ops);

CREATE INDEX idx_entities_embedding_hnsw
    ON entities USING hnsw (embedding vector_cosine_ops);

-- GIN indexes for full-text search and array columns
CREATE INDEX idx_facts_search_vector
    ON facts USING gin (search_vector);

CREATE INDEX idx_facts_tags
    ON facts USING gin (tags);

-- B-tree indexes: FK lookups
CREATE INDEX idx_api_keys_tenant_id        ON api_keys       (tenant_id);
CREATE INDEX idx_sessions_tenant_id        ON sessions       (tenant_id);
CREATE INDEX idx_extractions_tenant_id     ON extractions    (tenant_id);
CREATE INDEX idx_extractions_session_id    ON extractions    (session_id);
CREATE INDEX idx_facts_tenant_id           ON facts          (tenant_id);
CREATE INDEX idx_facts_session_id          ON facts          (session_id);
CREATE INDEX idx_facts_parent_id           ON facts          (parent_id);
CREATE INDEX idx_facts_contradicts_id      ON facts          (contradicts_id);
CREATE INDEX idx_entities_tenant_id        ON entities       (tenant_id);
CREATE INDEX idx_entities_merge_target_id  ON entities       (merge_target_id);
CREATE INDEX idx_fact_entities_entity_id   ON fact_entities  (entity_id);
CREATE INDEX idx_edges_tenant_id           ON edges          (tenant_id);
CREATE INDEX idx_edges_source_id           ON edges          (source_id);
CREATE INDEX idx_edges_target_id           ON edges          (target_id);
CREATE INDEX idx_edges_fact_id             ON edges          (fact_id);
CREATE INDEX idx_triggers_tenant_id        ON triggers       (tenant_id);
CREATE INDEX idx_memory_accesses_tenant_id ON memory_accesses (tenant_id);
CREATE INDEX idx_memory_accesses_fact_id   ON memory_accesses (fact_id);
CREATE INDEX idx_memory_accesses_trigger_id ON memory_accesses (trigger_id);
CREATE INDEX idx_usage_records_tenant_id   ON usage_records  (tenant_id);
CREATE INDEX idx_webhooks_tenant           ON webhooks       (tenant_id);
CREATE INDEX idx_webhooks_active           ON webhooks       (tenant_id, active) WHERE active = TRUE;

-- B-tree indexes: scope / scope_id lookups
CREATE INDEX idx_sessions_scope_scope_id      ON sessions    (scope, scope_id);
CREATE INDEX idx_facts_scope_scope_id         ON facts       (scope, scope_id);
CREATE INDEX idx_facts_lineage_id             ON facts       (lineage_id);
CREATE INDEX idx_extractions_scope_scope_id   ON extractions (scope, scope_id);
CREATE INDEX idx_triggers_scope_scope_id      ON triggers    (scope, scope_id);

-- B-tree indexes: temporal / validity queries
CREATE INDEX idx_facts_valid_from             ON facts       (valid_from);
CREATE INDEX idx_facts_valid_until            ON facts       (valid_until);
CREATE INDEX idx_edges_valid_from             ON edges       (valid_from);
CREATE INDEX idx_edges_valid_until            ON edges       (valid_until);
CREATE INDEX idx_sessions_started_at          ON sessions    (started_at);
CREATE INDEX idx_memory_accesses_accessed_at  ON memory_accesses (accessed_at);
CREATE INDEX idx_usage_records_period_start   ON usage_records (period_start);

-- B-tree indexes: decay / access frequency
CREATE INDEX idx_facts_decay_score            ON facts       (decay_score);
CREATE INDEX idx_facts_last_accessed          ON facts       (last_accessed);
CREATE INDEX idx_facts_importance             ON facts       (importance);

-- B-tree indexes: status lookups
CREATE INDEX idx_extractions_status           ON extractions (status);
CREATE INDEX idx_api_keys_active_tenant       ON api_keys    (tenant_id, active);
CREATE INDEX idx_facts_contradiction_status   ON facts       (contradiction_status);

-- =============================================================================
-- TRIGGERS (updated_at maintenance)
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_entities_updated_at
    BEFORE UPDATE ON entities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_usage_records_updated_at
    BEFORE UPDATE ON usage_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

ALTER TABLE tenants         ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE extractions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE facts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities        ENABLE ROW LEVEL SECURITY;
ALTER TABLE fact_entities   ENABLE ROW LEVEL SECURITY;
ALTER TABLE edges           ENABLE ROW LEVEL SECURITY;
ALTER TABLE triggers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_accesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records   ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks        ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenants
    USING (id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation ON api_keys
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation ON sessions
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation ON extractions
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation ON facts
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation ON entities
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- fact_entities has no tenant_id column; join through facts
CREATE POLICY tenant_isolation ON fact_entities
    USING (
        fact_id IN (
            SELECT id FROM facts
            WHERE tenant_id = current_setting('app.current_tenant_id')::uuid
        )
    );

CREATE POLICY tenant_isolation ON edges
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation ON triggers
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation ON memory_accesses
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation ON usage_records
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation ON webhooks
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================================
-- RPC Functions
-- =============================================================================

-- Atomic usage increment function
-- Uses INSERT ... ON CONFLICT DO UPDATE to atomically add to existing totals
-- rather than replacing them.
CREATE OR REPLACE FUNCTION increment_usage(
    p_tenant_id UUID,
    p_tokens INT,
    p_queries INT,
    p_extractions INT,
    p_cost_usd FLOAT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    p_start DATE := date_trunc('month', CURRENT_DATE)::date;
    p_end DATE := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date;
BEGIN
    INSERT INTO usage_records (id, tenant_id, period_start, period_end, tokens_used, queries_used, extractions_count, cost_usd)
    VALUES (gen_random_uuid(), p_tenant_id, p_start, p_end, p_tokens, p_queries, p_extractions, p_cost_usd)
    ON CONFLICT (tenant_id, period_start)
    DO UPDATE SET
        tokens_used = usage_records.tokens_used + EXCLUDED.tokens_used,
        queries_used = usage_records.queries_used + EXCLUDED.queries_used,
        extractions_count = usage_records.extractions_count + EXCLUDED.extractions_count,
        cost_usd = usage_records.cost_usd + EXCLUDED.cost_usd,
        updated_at = NOW();
END;
$$;

-- Vector similarity search function for Supabase .rpc() calls
CREATE OR REPLACE FUNCTION match_facts(
    query_embedding TEXT,
    match_tenant_id UUID,
    match_scope TEXT,
    match_scope_id TEXT,
    match_count INT,
    min_similarity FLOAT DEFAULT 0,
    match_as_of TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    tenant_id UUID,
    scope TEXT,
    scope_id TEXT,
    session_id UUID,
    content TEXT,
    embedding_model TEXT,
    embedding_dim INT,
    version INT,
    lineage_id UUID,
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    operation TEXT,
    parent_id UUID,
    importance FLOAT,
    frequency INT,
    last_accessed TIMESTAMPTZ,
    decay_score FLOAT,
    contradiction_status TEXT,
    contradicts_id UUID,
    source_type TEXT,
    source_ref JSONB,
    confidence FLOAT,
    original_content TEXT,
    extraction_id UUID,
    extraction_tier TEXT,
    modality TEXT,
    tags TEXT[],
    metadata JSONB,
    created_at TIMESTAMPTZ,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.id, f.tenant_id, f.scope, f.scope_id, f.session_id,
        f.content, f.embedding_model, f.embedding_dim,
        f.version, f.lineage_id, f.valid_from, f.valid_until,
        f.operation, f.parent_id, f.importance, f.frequency,
        f.last_accessed, f.decay_score, f.contradiction_status,
        f.contradicts_id, f.source_type, f.source_ref, f.confidence,
        f.original_content, f.extraction_id, f.extraction_tier,
        f.modality, f.tags, f.metadata, f.created_at,
        (1 - (f.embedding <=> query_embedding::vector)) AS similarity
    FROM facts f
    WHERE f.tenant_id = match_tenant_id
      AND f.scope = match_scope
      AND f.scope_id = match_scope_id
      AND (
        CASE
          WHEN match_as_of IS NOT NULL THEN
            f.valid_from <= match_as_of AND (f.valid_until IS NULL OR f.valid_until > match_as_of)
          ELSE
            f.valid_until IS NULL
        END
      )
      AND (1 - (f.embedding <=> query_embedding::vector)) >= min_similarity
    ORDER BY f.embedding <=> query_embedding::vector
    LIMIT match_count;
END;
$$;

-- Keyword search using PostgreSQL full-text search (tsvector/tsquery)
-- Returns facts matching the search query with ts_rank scoring.
CREATE OR REPLACE FUNCTION keyword_search_facts(
    search_query TEXT,
    match_tenant_id UUID,
    match_scope TEXT,
    match_scope_id TEXT,
    match_count INT,
    match_as_of TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    tenant_id UUID,
    scope TEXT,
    scope_id TEXT,
    session_id UUID,
    content TEXT,
    embedding_model TEXT,
    embedding_dim INT,
    version INT,
    lineage_id UUID,
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    operation TEXT,
    parent_id UUID,
    importance FLOAT,
    frequency INT,
    last_accessed TIMESTAMPTZ,
    decay_score FLOAT,
    contradiction_status TEXT,
    contradicts_id UUID,
    source_type TEXT,
    source_ref JSONB,
    confidence FLOAT,
    original_content TEXT,
    extraction_id UUID,
    extraction_tier TEXT,
    modality TEXT,
    tags TEXT[],
    metadata JSONB,
    created_at TIMESTAMPTZ,
    rank_score FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.id, f.tenant_id, f.scope, f.scope_id, f.session_id,
        f.content, f.embedding_model, f.embedding_dim,
        f.version, f.lineage_id, f.valid_from, f.valid_until,
        f.operation, f.parent_id, f.importance, f.frequency,
        f.last_accessed, f.decay_score, f.contradiction_status,
        f.contradicts_id, f.source_type, f.source_ref, f.confidence,
        f.original_content, f.extraction_id, f.extraction_tier,
        f.modality, f.tags, f.metadata, f.created_at,
        ts_rank(f.search_vector, plainto_tsquery('english', search_query)) AS rank_score
    FROM facts f
    WHERE f.tenant_id = match_tenant_id
      AND f.scope = match_scope
      AND f.scope_id = match_scope_id
      AND (
        CASE
          WHEN match_as_of IS NOT NULL THEN
            f.valid_from <= match_as_of AND (f.valid_until IS NULL OR f.valid_until > match_as_of)
          ELSE
            f.valid_until IS NULL
        END
      )
      AND f.search_vector @@ plainto_tsquery('english', search_query)
    ORDER BY rank_score DESC
    LIMIT match_count;
END;
$$;

-- Graph traversal using recursive CTE
-- Walks edges from seed entity IDs up to max_depth hops.
-- Returns entity and edge information for the traversal path.
CREATE OR REPLACE FUNCTION graph_traverse(
    match_tenant_id UUID,
    seed_entity_ids UUID[],
    max_depth INT DEFAULT 3,
    max_entities INT DEFAULT 200,
    match_as_of TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    entity_id UUID,
    entity_name TEXT,
    entity_type TEXT,
    canonical_name TEXT,
    properties JSONB,
    hop_depth INT,
    edge_id UUID,
    edge_source_id UUID,
    edge_target_id UUID,
    edge_relation TEXT,
    edge_type TEXT,
    edge_weight FLOAT,
    edge_valid_from TIMESTAMPTZ,
    edge_valid_until TIMESTAMPTZ,
    edge_confidence FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE traversal AS (
        SELECT
            e.id AS entity_id,
            e.name AS entity_name,
            e.entity_type,
            e.canonical_name,
            e.properties,
            0 AS hop_depth,
            NULL::UUID AS edge_id,
            NULL::UUID AS edge_source_id,
            NULL::UUID AS edge_target_id,
            NULL::TEXT AS edge_relation,
            NULL::TEXT AS edge_type,
            NULL::FLOAT AS edge_weight,
            NULL::TIMESTAMPTZ AS edge_valid_from,
            NULL::TIMESTAMPTZ AS edge_valid_until,
            NULL::FLOAT AS edge_confidence,
            ARRAY[e.id] AS visited_ids
        FROM entities e
        WHERE e.id = ANY(seed_entity_ids)
          AND e.tenant_id = match_tenant_id

        UNION ALL

        SELECT
            e2.id,
            e2.name,
            e2.entity_type,
            e2.canonical_name,
            e2.properties,
            t.hop_depth + 1,
            ed.id,
            ed.source_id,
            ed.target_id,
            ed.relation,
            ed.edge_type,
            ed.weight,
            ed.valid_from,
            ed.valid_until,
            ed.confidence,
            t.visited_ids || e2.id
        FROM traversal t
        JOIN edges ed ON (ed.source_id = t.entity_id OR ed.target_id = t.entity_id)
            AND ed.tenant_id = match_tenant_id
            AND (
              CASE
                WHEN match_as_of IS NOT NULL THEN
                  ed.valid_from <= match_as_of AND (ed.valid_until IS NULL OR ed.valid_until > match_as_of)
                ELSE
                  ed.valid_until IS NULL
              END
            )
        JOIN entities e2 ON e2.id = CASE
            WHEN ed.source_id = t.entity_id THEN ed.target_id
            ELSE ed.source_id
        END
            AND e2.tenant_id = match_tenant_id
        WHERE t.hop_depth < max_depth
          AND e2.id != ALL(t.visited_ids)
    )
    SELECT
        traversal.entity_id, traversal.entity_name, traversal.entity_type,
        traversal.canonical_name, traversal.properties,
        traversal.hop_depth, traversal.edge_id, traversal.edge_source_id,
        traversal.edge_target_id, traversal.edge_relation,
        traversal.edge_type, traversal.edge_weight, traversal.edge_valid_from,
        traversal.edge_valid_until, traversal.edge_confidence
    FROM traversal
    LIMIT max_entities;
END;
$$;

-- Compound search: vector + keyword in ONE database round-trip
-- This eliminates 2 separate RPC calls for search, cutting latency significantly.
CREATE OR REPLACE FUNCTION steno_search(
    query_embedding TEXT,
    search_query TEXT,
    match_tenant_id UUID,
    match_scope TEXT,
    match_scope_id TEXT,
    match_count INT DEFAULT 20,
    min_similarity FLOAT DEFAULT 0.0
)
RETURNS TABLE (
    source TEXT,
    id UUID,
    tenant_id UUID,
    scope TEXT,
    scope_id TEXT,
    session_id UUID,
    content TEXT,
    embedding_model TEXT,
    embedding_dim INT,
    version INT,
    lineage_id UUID,
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    operation TEXT,
    parent_id UUID,
    importance NUMERIC,
    frequency INT,
    last_accessed TIMESTAMPTZ,
    decay_score NUMERIC,
    contradiction_status TEXT,
    contradicts_id UUID,
    source_type TEXT,
    source_ref JSONB,
    confidence NUMERIC,
    original_content TEXT,
    extraction_id UUID,
    extraction_tier TEXT,
    modality TEXT,
    tags TEXT[],
    metadata JSONB,
    created_at TIMESTAMPTZ,
    relevance_score FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY

    -- Vector search results
    (SELECT
        'vector'::TEXT AS source,
        f.id, f.tenant_id, f.scope, f.scope_id, f.session_id,
        f.content, f.embedding_model, f.embedding_dim,
        f.version, f.lineage_id, f.valid_from, f.valid_until,
        f.operation, f.parent_id, f.importance, f.frequency,
        f.last_accessed, f.decay_score, f.contradiction_status,
        f.contradicts_id, f.source_type, f.source_ref, f.confidence,
        f.original_content, f.extraction_id, f.extraction_tier,
        f.modality, f.tags, f.metadata, f.created_at,
        (1 - (f.embedding <=> query_embedding::vector))::float AS relevance_score
    FROM facts f
    WHERE f.tenant_id = match_tenant_id
      AND f.scope = match_scope
      AND f.scope_id = match_scope_id
      AND f.valid_until IS NULL
      AND (1 - (f.embedding <=> query_embedding::vector)) >= min_similarity
    ORDER BY f.embedding <=> query_embedding::vector
    LIMIT match_count)

    UNION ALL

    -- Keyword search results (FTS)
    (SELECT
        'keyword'::TEXT AS source,
        f.id, f.tenant_id, f.scope, f.scope_id, f.session_id,
        f.content, f.embedding_model, f.embedding_dim,
        f.version, f.lineage_id, f.valid_from, f.valid_until,
        f.operation, f.parent_id, f.importance, f.frequency,
        f.last_accessed, f.decay_score, f.contradiction_status,
        f.contradicts_id, f.source_type, f.source_ref, f.confidence,
        f.original_content, f.extraction_id, f.extraction_tier,
        f.modality, f.tags, f.metadata, f.created_at,
        ts_rank(f.search_vector, plainto_tsquery('english', search_query))::float AS relevance_score
    FROM facts f
    WHERE f.tenant_id = match_tenant_id
      AND f.scope = match_scope
      AND f.scope_id = match_scope_id
      AND f.valid_until IS NULL
      AND f.search_vector @@ plainto_tsquery('english', search_query)
    ORDER BY relevance_score DESC
    LIMIT match_count);
END;
$$;

-- Embedding dimension placeholder: {EMBEDDING_DIM}
-- Replace at migration time, e.g.: sed 's/{EMBEDDING_DIM}/1536/g' 006_create_facts.sql

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
    operation             TEXT        NOT NULL DEFAULT 'create',
    parent_id             UUID        REFERENCES facts(id) ON DELETE SET NULL,
    importance            NUMERIC(5, 4) NOT NULL DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),
    frequency             INTEGER     NOT NULL DEFAULT 1,
    last_accessed         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decay_score           NUMERIC(8, 6) NOT NULL DEFAULT 1.0,
    contradiction_status  TEXT        NOT NULL DEFAULT 'none',
    contradicts_id        UUID        REFERENCES facts(id) ON DELETE SET NULL,
    source_type           TEXT,
    source_ref            TEXT,
    confidence            NUMERIC(5, 4) NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
    original_content      TEXT,
    -- extraction_id: intentionally no FK; enforced at application level
    extraction_id         UUID,
    extraction_tier       TEXT,
    modality              TEXT,
    tags                  TEXT[]      NOT NULL DEFAULT '{}',
    metadata              JSONB       NOT NULL DEFAULT '{}',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HNSW vector index (approximate nearest neighbour search)
CREATE INDEX idx_facts_embedding_hnsw
    ON facts USING hnsw (embedding vector_cosine_ops);

-- GIN indexes for full-text search and array columns
CREATE INDEX idx_facts_search_vector ON facts USING gin (search_vector);
CREATE INDEX idx_facts_tags          ON facts USING gin (tags);

-- B-tree indexes: FK lookups
CREATE INDEX idx_facts_tenant_id      ON facts (tenant_id);
CREATE INDEX idx_facts_session_id     ON facts (session_id);
CREATE INDEX idx_facts_parent_id      ON facts (parent_id);
CREATE INDEX idx_facts_contradicts_id ON facts (contradicts_id);

-- B-tree indexes: scope / scope_id lookups
CREATE INDEX idx_facts_scope_scope_id ON facts (scope, scope_id);
CREATE INDEX idx_facts_lineage_id     ON facts (lineage_id);

-- B-tree indexes: temporal / validity queries
CREATE INDEX idx_facts_valid_from  ON facts (valid_from);
CREATE INDEX idx_facts_valid_until ON facts (valid_until);

-- B-tree indexes: decay / access frequency
CREATE INDEX idx_facts_decay_score   ON facts (decay_score);
CREATE INDEX idx_facts_last_accessed ON facts (last_accessed);
CREATE INDEX idx_facts_importance    ON facts (importance);

-- B-tree indexes: status lookups
CREATE INDEX idx_facts_contradiction_status ON facts (contradiction_status);

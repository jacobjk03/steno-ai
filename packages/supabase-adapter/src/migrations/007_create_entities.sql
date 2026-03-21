-- Embedding dimension placeholder: {EMBEDDING_DIM}
-- Replace at migration time, e.g.: sed 's/{EMBEDDING_DIM}/1536/g' 007_create_entities.sql

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

-- HNSW vector index (approximate nearest neighbour search)
CREATE INDEX idx_entities_embedding_hnsw
    ON entities USING hnsw (embedding vector_cosine_ops);

-- B-tree indexes
CREATE INDEX idx_entities_tenant_id       ON entities (tenant_id);
CREATE INDEX idx_entities_merge_target_id ON entities (merge_target_id);

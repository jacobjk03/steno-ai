CREATE TABLE memory_accesses (
    id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    fact_id           UUID        NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
    query             TEXT,
    retrieval_method  TEXT,
    similarity_score  NUMERIC(8, 6),
    rank_position     INTEGER,
    was_useful        BOOLEAN,
    was_corrected     BOOLEAN,
    feedback_type     TEXT,
    feedback_detail   TEXT,
    trigger_id        UUID        REFERENCES triggers(id) ON DELETE SET NULL,
    accessed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_memory_accesses_tenant_id  ON memory_accesses (tenant_id);
CREATE INDEX idx_memory_accesses_fact_id    ON memory_accesses (fact_id);
CREATE INDEX idx_memory_accesses_trigger_id ON memory_accesses (trigger_id);
CREATE INDEX idx_memory_accesses_accessed_at ON memory_accesses (accessed_at);

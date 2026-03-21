CREATE TABLE extractions (
    id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    status                TEXT        NOT NULL DEFAULT 'queued'
                                      CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'deduped')),
    input_type            TEXT        NOT NULL,
    input_data            TEXT        NOT NULL,
    input_hash            TEXT        NOT NULL,
    input_size            INTEGER     NOT NULL DEFAULT 0,
    scope                 TEXT,
    scope_id              TEXT,
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

CREATE INDEX idx_extractions_tenant_id   ON extractions (tenant_id);
CREATE INDEX idx_extractions_session_id  ON extractions (session_id);
CREATE INDEX idx_extractions_scope_scope_id ON extractions (scope, scope_id);
CREATE INDEX idx_extractions_status      ON extractions (status);

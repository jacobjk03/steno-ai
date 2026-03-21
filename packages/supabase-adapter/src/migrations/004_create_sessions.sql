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

CREATE INDEX idx_sessions_tenant_id     ON sessions (tenant_id);
CREATE INDEX idx_sessions_scope_scope_id ON sessions (scope, scope_id);
CREATE INDEX idx_sessions_started_at    ON sessions (started_at);

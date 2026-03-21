CREATE TABLE triggers (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    scope          TEXT,
    scope_id       TEXT,
    condition      JSONB       NOT NULL DEFAULT '{}',
    fact_ids       UUID[]      NOT NULL DEFAULT '{}',
    entity_ids     UUID[]      NOT NULL DEFAULT '{}',
    query_template TEXT,
    priority       INTEGER     NOT NULL DEFAULT 5,
    active         BOOLEAN     NOT NULL DEFAULT TRUE,
    times_fired    INTEGER     NOT NULL DEFAULT 0,
    last_fired_at  TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_triggers_tenant_id     ON triggers (tenant_id);
CREATE INDEX idx_triggers_scope_scope_id ON triggers (scope, scope_id);

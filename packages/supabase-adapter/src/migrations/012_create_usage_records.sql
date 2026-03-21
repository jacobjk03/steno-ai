CREATE TABLE usage_records (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    period_start        TIMESTAMPTZ NOT NULL,
    period_end          TIMESTAMPTZ NOT NULL,
    tokens_used         BIGINT      NOT NULL DEFAULT 0,
    queries_used        BIGINT      NOT NULL DEFAULT 0,
    extractions_count   BIGINT      NOT NULL DEFAULT 0,
    cost_usd            NUMERIC(12, 6) NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, period_start)
);

CREATE INDEX idx_usage_records_tenant_id    ON usage_records (tenant_id);
CREATE INDEX idx_usage_records_period_start ON usage_records (period_start);

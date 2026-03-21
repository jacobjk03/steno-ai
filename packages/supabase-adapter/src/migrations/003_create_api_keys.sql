CREATE TABLE api_keys (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key_hash     TEXT        NOT NULL,
    key_prefix   TEXT        NOT NULL,
    name         TEXT        NOT NULL,
    scopes       TEXT[]      NOT NULL DEFAULT '{}',
    expires_at   TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_tenant_id   ON api_keys (tenant_id);
CREATE INDEX idx_api_keys_active_tenant ON api_keys (tenant_id, active);

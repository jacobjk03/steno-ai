CREATE TABLE IF NOT EXISTS session_messages (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role            TEXT        NOT NULL DEFAULT 'user',
    content         TEXT        NOT NULL,
    turn_number     INTEGER     NOT NULL,
    extraction_id   UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_messages_session ON session_messages(session_id, turn_number);
CREATE INDEX IF NOT EXISTS idx_session_messages_unextracted ON session_messages(session_id) WHERE extraction_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_session_messages_tenant ON session_messages(tenant_id);

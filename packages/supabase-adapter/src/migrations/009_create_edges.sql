CREATE TABLE edges (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_id   UUID        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    target_id   UUID        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    relation    TEXT        NOT NULL,
    edge_type   TEXT        NOT NULL CHECK (edge_type IN ('semantic', 'causal', 'temporal', 'hierarchical', 'associative', 'contradicts', 'supports')),
    weight      NUMERIC(5, 4) NOT NULL DEFAULT 1.0 CHECK (weight >= 0 AND weight <= 1),
    valid_from  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    fact_id     UUID        REFERENCES facts(id) ON DELETE SET NULL,
    confidence  NUMERIC(5, 4) NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
    metadata    JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_edges_tenant_id  ON edges (tenant_id);
CREATE INDEX idx_edges_source_id  ON edges (source_id);
CREATE INDEX idx_edges_target_id  ON edges (target_id);
CREATE INDEX idx_edges_fact_id    ON edges (fact_id);
CREATE INDEX idx_edges_valid_from  ON edges (valid_from);
CREATE INDEX idx_edges_valid_until ON edges (valid_until);

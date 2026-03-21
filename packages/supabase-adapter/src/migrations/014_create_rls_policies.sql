ALTER TABLE tenants         ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE extractions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE facts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities        ENABLE ROW LEVEL SECURITY;
ALTER TABLE fact_entities   ENABLE ROW LEVEL SECURITY;
ALTER TABLE edges           ENABLE ROW LEVEL SECURITY;
ALTER TABLE triggers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_accesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records   ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenants
    USING (id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation ON api_keys
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation ON sessions
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation ON extractions
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation ON facts
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation ON entities
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- fact_entities has no tenant_id column; join through facts
CREATE POLICY tenant_isolation ON fact_entities
    USING (
        fact_id IN (
            SELECT id FROM facts
            WHERE tenant_id = current_setting('app.current_tenant_id')::uuid
        )
    );

CREATE POLICY tenant_isolation ON edges
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation ON triggers
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation ON memory_accesses
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation ON usage_records
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

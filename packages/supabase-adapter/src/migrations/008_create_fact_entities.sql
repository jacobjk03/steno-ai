CREATE TABLE fact_entities (
    fact_id    UUID        NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
    entity_id  UUID        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    role       TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (fact_id, entity_id)
);

CREATE INDEX idx_fact_entities_entity_id ON fact_entities (entity_id);

-- Retrieve facts linked to a set of entities via the fact_entities junction table.
-- Used by graph traversal to hydrate facts for discovered entities.
CREATE OR REPLACE FUNCTION get_facts_for_entities(
    match_tenant_id UUID,
    entity_ids UUID[],
    per_entity_limit INT DEFAULT 20
)
RETURNS TABLE (
    entity_id           UUID,
    fact_id             UUID,
    tenant_id           UUID,
    scope               TEXT,
    scope_id            TEXT,
    session_id          UUID,
    content             TEXT,
    embedding_model     TEXT,
    embedding_dim       INTEGER,
    version             INTEGER,
    lineage_id          UUID,
    valid_from          TIMESTAMPTZ,
    valid_until         TIMESTAMPTZ,
    operation           TEXT,
    parent_id           UUID,
    importance          NUMERIC,
    frequency           INTEGER,
    last_accessed       TIMESTAMPTZ,
    decay_score         NUMERIC,
    contradiction_status TEXT,
    contradicts_id      UUID,
    source_type         TEXT,
    source_ref          JSONB,
    confidence          NUMERIC,
    original_content    TEXT,
    extraction_id       UUID,
    extraction_tier     TEXT,
    modality            TEXT,
    tags                TEXT[],
    metadata            JSONB,
    created_at          TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ranked.entity_id,
        ranked.fact_id,
        ranked.tenant_id,
        ranked.scope,
        ranked.scope_id,
        ranked.session_id,
        ranked.content,
        ranked.embedding_model,
        ranked.embedding_dim,
        ranked.version,
        ranked.lineage_id,
        ranked.valid_from,
        ranked.valid_until,
        ranked.operation,
        ranked.parent_id,
        ranked.importance,
        ranked.frequency,
        ranked.last_accessed,
        ranked.decay_score,
        ranked.contradiction_status,
        ranked.contradicts_id,
        ranked.source_type,
        ranked.source_ref,
        ranked.confidence,
        ranked.original_content,
        ranked.extraction_id,
        ranked.extraction_tier,
        ranked.modality,
        ranked.tags,
        ranked.metadata,
        ranked.created_at
    FROM (
        SELECT
            fe.entity_id,
            f.id AS fact_id,
            f.tenant_id,
            f.scope,
            f.scope_id,
            f.session_id,
            f.content,
            f.embedding_model,
            f.embedding_dim,
            f.version,
            f.lineage_id,
            f.valid_from,
            f.valid_until,
            f.operation,
            f.parent_id,
            f.importance,
            f.frequency,
            f.last_accessed,
            f.decay_score,
            f.contradiction_status,
            f.contradicts_id,
            f.source_type,
            f.source_ref,
            f.confidence,
            f.original_content,
            f.extraction_id,
            f.extraction_tier,
            f.modality,
            f.tags,
            f.metadata,
            f.created_at,
            ROW_NUMBER() OVER (
                PARTITION BY fe.entity_id
                ORDER BY f.importance DESC, f.created_at DESC
            ) AS rn
        FROM fact_entities fe
        JOIN facts f ON f.id = fe.fact_id
        WHERE fe.entity_id = ANY(entity_ids)
          AND f.tenant_id = match_tenant_id
          AND f.valid_until IS NULL
          AND NOT ('raw_chunk' = ANY(f.tags))
    ) ranked
    WHERE ranked.rn <= per_entity_limit;
END;
$$;

-- Vector similarity search on entities table
-- Used by graph seeding to find relevant entities for a query
CREATE OR REPLACE FUNCTION match_entities(
    query_embedding TEXT,
    match_tenant_id UUID,
    match_count INT DEFAULT 10,
    min_similarity FLOAT DEFAULT 0.3
)
RETURNS TABLE (
    id UUID,
    tenant_id UUID,
    name TEXT,
    entity_type TEXT,
    canonical_name TEXT,
    properties JSONB,
    embedding_model TEXT,
    embedding_dim INT,
    merge_target_id UUID,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id, e.tenant_id, e.name, e.entity_type, e.canonical_name,
        e.properties, e.embedding_model, e.embedding_dim,
        e.merge_target_id, e.created_at, e.updated_at,
        (1 - (e.embedding <=> query_embedding::vector))::float AS similarity
    FROM entities e
    WHERE e.tenant_id = match_tenant_id
      AND e.embedding IS NOT NULL
      AND (1 - (e.embedding <=> query_embedding::vector)) >= min_similarity
    ORDER BY e.embedding <=> query_embedding::vector
    LIMIT match_count;
END;
$$;

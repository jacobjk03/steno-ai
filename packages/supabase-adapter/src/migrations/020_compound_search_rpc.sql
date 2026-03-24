-- Compound search: vector + keyword in ONE database round-trip
-- This eliminates 2 separate RPC calls

CREATE OR REPLACE FUNCTION steno_search(
    query_embedding TEXT,
    search_query TEXT,
    match_tenant_id UUID,
    match_scope TEXT,
    match_scope_id TEXT,
    match_count INT DEFAULT 20,
    min_similarity FLOAT DEFAULT 0.0
)
RETURNS TABLE (
    source TEXT,
    id UUID,
    tenant_id UUID,
    scope TEXT,
    scope_id TEXT,
    session_id UUID,
    content TEXT,
    embedding_model TEXT,
    embedding_dim INT,
    version INT,
    lineage_id UUID,
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    operation TEXT,
    parent_id UUID,
    importance NUMERIC,
    frequency INT,
    last_accessed TIMESTAMPTZ,
    decay_score NUMERIC,
    contradiction_status TEXT,
    contradicts_id UUID,
    source_type TEXT,
    source_ref JSONB,
    confidence NUMERIC,
    original_content TEXT,
    extraction_id UUID,
    extraction_tier TEXT,
    modality TEXT,
    tags TEXT[],
    metadata JSONB,
    created_at TIMESTAMPTZ,
    relevance_score FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY

    -- Vector search results (exclude raw chunks — only search atomic extracted facts)
    (SELECT
        'vector'::TEXT AS source,
        f.id, f.tenant_id, f.scope, f.scope_id, f.session_id,
        f.content, f.embedding_model, f.embedding_dim,
        f.version, f.lineage_id, f.valid_from, f.valid_until,
        f.operation, f.parent_id, f.importance, f.frequency,
        f.last_accessed, f.decay_score, f.contradiction_status,
        f.contradicts_id, f.source_type, f.source_ref, f.confidence,
        f.original_content, f.extraction_id, f.extraction_tier,
        f.modality, f.tags, f.metadata, f.created_at,
        (1 - (f.embedding <=> query_embedding::vector))::float AS relevance_score
    FROM facts f
    WHERE f.tenant_id = match_tenant_id
      AND f.scope = match_scope
      AND f.scope_id = match_scope_id
      AND f.valid_until IS NULL
      AND f.source_type != 'api'
      AND NOT ('raw_chunk' = ANY(f.tags))
      AND (1 - (f.embedding <=> query_embedding::vector)) >= min_similarity
    ORDER BY f.embedding <=> query_embedding::vector
    LIMIT match_count)

    UNION ALL

    -- Keyword search results (FTS, exclude raw chunks)
    (SELECT
        'keyword'::TEXT AS source,
        f.id, f.tenant_id, f.scope, f.scope_id, f.session_id,
        f.content, f.embedding_model, f.embedding_dim,
        f.version, f.lineage_id, f.valid_from, f.valid_until,
        f.operation, f.parent_id, f.importance, f.frequency,
        f.last_accessed, f.decay_score, f.contradiction_status,
        f.contradicts_id, f.source_type, f.source_ref, f.confidence,
        f.original_content, f.extraction_id, f.extraction_tier,
        f.modality, f.tags, f.metadata, f.created_at,
        ts_rank(f.search_vector, plainto_tsquery('english', search_query))::float AS relevance_score
    FROM facts f
    WHERE f.tenant_id = match_tenant_id
      AND f.scope = match_scope
      AND f.scope_id = match_scope_id
      AND f.valid_until IS NULL
      AND f.source_type != 'api'
      AND NOT ('raw_chunk' = ANY(f.tags))
      AND f.search_vector @@ plainto_tsquery('english', search_query)
    ORDER BY relevance_score DESC
    LIMIT match_count);
END;
$$;

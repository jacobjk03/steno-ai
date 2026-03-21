-- =============================================================================
-- RPC Functions for Supabase .rpc() calls
-- =============================================================================

-- Vector similarity search function
-- Called by SupabaseStorageAdapter.vectorSearch()
CREATE OR REPLACE FUNCTION match_facts(
    query_embedding TEXT,
    match_tenant_id UUID,
    match_scope TEXT,
    match_scope_id TEXT,
    match_count INT,
    min_similarity FLOAT DEFAULT 0
)
RETURNS TABLE (
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
    importance FLOAT,
    frequency INT,
    last_accessed TIMESTAMPTZ,
    decay_score FLOAT,
    contradiction_status TEXT,
    contradicts_id UUID,
    source_type TEXT,
    source_ref JSONB,
    confidence FLOAT,
    original_content TEXT,
    extraction_id UUID,
    extraction_tier TEXT,
    modality TEXT,
    tags TEXT[],
    metadata JSONB,
    created_at TIMESTAMPTZ,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.id, f.tenant_id, f.scope, f.scope_id, f.session_id,
        f.content, f.embedding_model, f.embedding_dim,
        f.version, f.lineage_id, f.valid_from, f.valid_until,
        f.operation, f.parent_id, f.importance, f.frequency,
        f.last_accessed, f.decay_score, f.contradiction_status,
        f.contradicts_id, f.source_type, f.source_ref, f.confidence,
        f.original_content, f.extraction_id, f.extraction_tier,
        f.modality, f.tags, f.metadata, f.created_at,
        (1 - (f.embedding <=> query_embedding::vector)) AS similarity
    FROM facts f
    WHERE f.tenant_id = match_tenant_id
      AND f.scope = match_scope
      AND f.scope_id = match_scope_id
      AND f.valid_until IS NULL
      AND (1 - (f.embedding <=> query_embedding::vector)) >= min_similarity
    ORDER BY f.embedding <=> query_embedding::vector
    LIMIT match_count;
END;
$$;

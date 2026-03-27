-- =============================================================================
-- RPC Functions for Supabase .rpc() calls
-- =============================================================================

-- Atomic usage increment function
-- Called by SupabaseStorageAdapter.incrementUsage()
-- Uses INSERT ... ON CONFLICT DO UPDATE to atomically add to existing totals
-- rather than replacing them (which .upsert() does by default).
-- IMPORTANT: Requires UNIQUE constraint on (tenant_id, period_start).
CREATE OR REPLACE FUNCTION increment_usage(
    p_tenant_id UUID,
    p_tokens INT,
    p_queries INT,
    p_extractions INT,
    p_cost_usd FLOAT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    p_start DATE := date_trunc('month', CURRENT_DATE)::date;
    p_end DATE := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date;
BEGIN
    INSERT INTO usage_records (id, tenant_id, period_start, period_end, tokens_used, queries_used, extractions_count, cost_usd)
    VALUES (gen_random_uuid(), p_tenant_id, p_start, p_end, p_tokens, p_queries, p_extractions, p_cost_usd)
    ON CONFLICT (tenant_id, period_start)
    DO UPDATE SET
        tokens_used = usage_records.tokens_used + EXCLUDED.tokens_used,
        queries_used = usage_records.queries_used + EXCLUDED.queries_used,
        extractions_count = usage_records.extractions_count + EXCLUDED.extractions_count,
        cost_usd = usage_records.cost_usd + EXCLUDED.cost_usd,
        updated_at = NOW();
END;
$$;

-- Vector similarity search function
-- Called by SupabaseStorageAdapter.vectorSearch()
-- NOTE: session_id is TEXT (not UUID) to support non-UUID session identifiers.
-- NOTE: importance, decay_score, confidence are NUMERIC to match the facts table.
CREATE OR REPLACE FUNCTION match_facts(
    query_embedding TEXT,
    match_tenant_id UUID,
    match_scope TEXT,
    match_scope_id TEXT,
    match_count INT,
    min_similarity FLOAT DEFAULT 0,
    match_as_of TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    tenant_id UUID,
    scope TEXT,
    scope_id TEXT,
    session_id TEXT,
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
    event_date TIMESTAMPTZ,
    document_date TIMESTAMPTZ,
    source_chunk TEXT,
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
        f.modality, f.tags, f.metadata,
        f.event_date, f.document_date, f.source_chunk,
        f.created_at,
        (1 - (f.embedding <=> query_embedding::vector)) AS similarity
    FROM facts f
    WHERE f.tenant_id = match_tenant_id
      AND f.scope = match_scope
      AND f.scope_id = match_scope_id
      AND (
        CASE
          WHEN match_as_of IS NOT NULL THEN
            f.valid_from <= match_as_of AND (f.valid_until IS NULL OR f.valid_until > match_as_of)
          ELSE
            f.valid_until IS NULL
        END
      )
      AND (1 - (f.embedding <=> query_embedding::vector)) >= min_similarity
    ORDER BY f.embedding <=> query_embedding::vector
    LIMIT match_count;
END;
$$;

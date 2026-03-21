-- Graph traversal using recursive CTE
-- Walks edges from seed entity IDs up to max_depth hops.
-- Returns entity and edge information for the traversal path.

CREATE OR REPLACE FUNCTION graph_traverse(
    match_tenant_id UUID,
    seed_entity_ids UUID[],
    max_depth INT DEFAULT 3,
    max_entities INT DEFAULT 200
)
RETURNS TABLE (
    entity_id UUID,
    entity_name TEXT,
    entity_type TEXT,
    canonical_name TEXT,
    properties JSONB,
    hop_depth INT,
    -- Edge info for the path
    edge_id UUID,
    edge_source_id UUID,
    edge_target_id UUID,
    edge_relation TEXT,
    edge_type TEXT,
    edge_weight FLOAT,
    edge_valid_from TIMESTAMPTZ,
    edge_valid_until TIMESTAMPTZ,
    edge_confidence FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE traversal AS (
        -- Base case: seed entities at depth 0
        SELECT
            e.id AS entity_id,
            e.name AS entity_name,
            e.entity_type,
            e.canonical_name,
            e.properties,
            0 AS hop_depth,
            NULL::UUID AS edge_id,
            NULL::UUID AS edge_source_id,
            NULL::UUID AS edge_target_id,
            NULL::TEXT AS edge_relation,
            NULL::TEXT AS edge_type,
            NULL::FLOAT AS edge_weight,
            NULL::TIMESTAMPTZ AS edge_valid_from,
            NULL::TIMESTAMPTZ AS edge_valid_until,
            NULL::FLOAT AS edge_confidence
        FROM entities e
        WHERE e.id = ANY(seed_entity_ids)
          AND e.tenant_id = match_tenant_id

        UNION ALL

        -- Recursive case: follow edges
        SELECT
            e2.id,
            e2.name,
            e2.entity_type,
            e2.canonical_name,
            e2.properties,
            t.hop_depth + 1,
            ed.id,
            ed.source_id,
            ed.target_id,
            ed.relation,
            ed.edge_type,
            ed.weight,
            ed.valid_from,
            ed.valid_until,
            ed.confidence
        FROM traversal t
        JOIN edges ed ON (ed.source_id = t.entity_id OR ed.target_id = t.entity_id)
            AND ed.tenant_id = match_tenant_id
            AND ed.valid_until IS NULL
        JOIN entities e2 ON e2.id = CASE
            WHEN ed.source_id = t.entity_id THEN ed.target_id
            ELSE ed.source_id
        END
            AND e2.tenant_id = match_tenant_id
        WHERE t.hop_depth < max_depth
    )
    SELECT * FROM traversal
    LIMIT max_entities;
END;
$$;

-- Update edge_type constraint to include new relational versioning types
-- and fix legacy types (semantic, contradicts, supports → contradictory)
ALTER TABLE edges DROP CONSTRAINT IF EXISTS edges_edge_type_check;
ALTER TABLE edges ADD CONSTRAINT edges_edge_type_check CHECK (
  edge_type = ANY (ARRAY[
    'associative', 'causal', 'temporal', 'contradictory', 'hierarchical',
    'updates', 'extends', 'derives',
    -- Legacy types kept for backward compatibility
    'semantic', 'contradicts', 'supports'
  ])
);

-- Add missing signing_key column to webhooks
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS signing_key TEXT;

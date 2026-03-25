-- Dual timestamps: document_date (when conversation happened) + event_date (when the event occurred)
-- Like Hydra DB's temporal grounding for better temporal reasoning.
ALTER TABLE facts ADD COLUMN IF NOT EXISTS event_date TIMESTAMPTZ;
ALTER TABLE facts ADD COLUMN IF NOT EXISTS document_date TIMESTAMPTZ;

-- Index for temporal queries
CREATE INDEX IF NOT EXISTS idx_facts_event_date ON facts (event_date) WHERE event_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_facts_document_date ON facts (document_date) WHERE document_date IS NOT NULL;

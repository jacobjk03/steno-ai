-- Alter facts.source_ref from TEXT to JSONB
ALTER TABLE facts ALTER COLUMN source_ref TYPE JSONB USING source_ref::jsonb;

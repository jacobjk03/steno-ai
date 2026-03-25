-- Store the original conversation chunk alongside extracted facts.
-- Enables "search on atomic facts, answer with full context" retrieval pattern.
ALTER TABLE facts ADD COLUMN IF NOT EXISTS source_chunk TEXT;

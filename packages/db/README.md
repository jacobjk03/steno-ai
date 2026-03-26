# @steno-ai/db

Database schema and seed data for Steno's PostgreSQL backend (Supabase).

## Contents

```
packages/db/
  package.json
  schema.sql    -- Full DDL: tables, indexes, extensions (pgvector, pg_trgm)
  seed.sql      -- Optional seed data
```

## Usage

Apply the schema to a Supabase/PostgreSQL database:

```bash
# Replace the embedding dimension placeholder and apply
sed 's/{EMBEDDING_DIM}/1536/g' schema.sql | psql "$DATABASE_URL"
```

The schema requires these PostgreSQL extensions:

- `uuid-ossp` -- UUID generation
- `vector` -- pgvector for embeddings
- `pg_trgm` -- trigram indexes for keyword search

## Tables

`tenants`, `facts`, `entities`, `edges`, `triggers`, `memory_accesses`, `extractions`, `sessions`, `api_keys`, `usage_records`, `webhooks`

## Part of [Steno](https://github.com/SankrityaT/steno-ai)

The memory layer for AI agents.

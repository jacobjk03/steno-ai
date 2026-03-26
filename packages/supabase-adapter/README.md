# @steno-ai/supabase-adapter

Supabase/PostgreSQL storage adapter for Steno. Uses pgvector for embeddings and pg_trgm for keyword search.

## Install

```bash
npm install @steno-ai/supabase-adapter
```

## Usage

```ts
import { SupabaseStorageAdapter, createSupabaseClient } from '@steno-ai/supabase-adapter';

const client = createSupabaseClient({
  url: process.env.SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
});

const storage = new SupabaseStorageAdapter(client);

// Use with @steno-ai/engine
import { runExtractionPipeline, search } from '@steno-ai/engine';

await runExtractionPipeline({ storage, embedding, cheapLLM, ... }, input);
const results = await search({ storage, embedding }, options);
```

## Part of [Steno](https://github.com/SankrityaT/steno-ai)

The memory layer for AI agents.

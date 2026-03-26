# @steno-ai/sqlite-adapter

SQLite storage adapter for Steno. Uses `better-sqlite3` with built-in FTS5 full-text search and in-process vector similarity.

## Install

```bash
npm install @steno-ai/sqlite-adapter
```

## Usage

```ts
import { SQLiteStorageAdapter } from '@steno-ai/sqlite-adapter';

const storage = new SQLiteStorageAdapter('./steno.db');

// Use with @steno-ai/engine
import { runExtractionPipeline, search } from '@steno-ai/engine';

await runExtractionPipeline({ storage, embedding, cheapLLM, ... }, input);
const results = await search({ storage, embedding }, options);
```

## Utilities

```ts
import {
  initializeDatabase,
  cosineSimilarity,
  serializeEmbedding,
  deserializeEmbedding,
} from '@steno-ai/sqlite-adapter';
```

## Part of [Steno](https://github.com/SankrityaT/steno-ai)

The memory layer for AI agents.

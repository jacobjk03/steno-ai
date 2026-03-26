# @steno-ai/engine

The core memory engine for Steno. Handles extraction, retrieval, knowledge graphs, salience scoring, contradiction detection, and more.

## Install

```bash
npm install @steno-ai/engine
```

## Architecture

```
Conversation / Raw Text
        |
        v
  ┌─────────────────────────────────────────┐
  │         Extraction Pipeline              │
  │  heuristic -> LLM -> dedup -> contradict │
  │  -> entity extraction -> embed -> store  │
  └─────────────────────────────────────────┘
        |
        v
  ┌─────────────────────────────────────────┐
  │         Storage (Facts + Graph)          │
  │  facts, entities, edges, embeddings      │
  └─────────────────────────────────────────┘
        |
        v
  ┌─────────────────────────────────────────┐
  │         6-Signal Retrieval               │
  │  vector + keyword + graph + temporal     │
  │  + salience decay + trigger matching     │
  │  -> fusion ranking -> reranking          │
  └─────────────────────────────────────────┘
```

## Usage

### Extraction Pipeline

```ts
import { runExtractionPipeline } from '@steno-ai/engine';

const result = await runExtractionPipeline(
  {
    storage,       // StorageAdapter (sqlite, supabase)
    embedding,     // EmbeddingAdapter (openai, openai-compat)
    cheapLLM,      // LLMAdapter for fast extraction
    smartLLM,      // LLMAdapter for complex extraction (optional)
    embeddingModel: 'text-embedding-3-small',
    embeddingDim: 1536,
  },
  {
    tenantId: 'tenant_1',
    scope: 'user',
    scopeId: 'user_123',
    sourceType: 'conversation',
    data: [
      { role: 'user', content: 'I just moved to San Francisco' },
      { role: 'assistant', content: 'Welcome to SF!' },
    ],
  },
);

console.log(result.facts);    // extracted memory facts
console.log(result.entities); // knowledge graph entities
console.log(result.edges);    // entity relationships
```

### Search (6-Signal Retrieval)

```ts
import { search } from '@steno-ai/engine';

const results = await search(
  {
    storage,
    embedding,
    cache,                     // optional CacheAdapter
    rerank: true,              // embedding-based reranking
    salienceHalfLifeDays: 30,  // decay curve
  },
  {
    tenantId: 'tenant_1',
    scope: 'user',
    scopeId: 'user_123',
    query: 'where does the user live?',
    limit: 10,
    includeGraph: true,
  },
);

for (const r of results.results) {
  console.log(r.content, r.score);
}
```

## Adapter Interfaces

The engine defines these interfaces -- bring your own implementations or use the official adapters:

| Interface | Official Adapters |
|-----------|-------------------|
| `StorageAdapter` | `@steno-ai/sqlite-adapter`, `@steno-ai/supabase-adapter` |
| `LLMAdapter` | `@steno-ai/openai-adapter`, `@steno-ai/openai-compat-adapter` |
| `EmbeddingAdapter` | `@steno-ai/openai-adapter`, `@steno-ai/openai-compat-adapter` |
| `CacheAdapter` | `@steno-ai/cache-adapter` |

## Key Modules

- **extraction/** -- Heuristic + LLM fact extraction, deduplication, contradiction detection, entity extraction
- **retrieval/** -- Vector search, keyword search, graph traversal, salience scoring, fusion ranking, reranking
- **salience/** -- Time-decay scoring, feedback boosting
- **sessions/** -- Session lifecycle management
- **feedback/** -- Feedback tracking and fact score adjustment
- **profiles/** -- User profile aggregation
- **scratchpad/** -- Working memory / scratchpad updates

## Part of [Steno](https://github.com/SankrityaT/steno-ai)

The memory layer for AI agents.

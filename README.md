# Steno

A memory engine for LLMs. Gives AI assistants persistent, long-term memory across conversations.

Steno extracts atomic facts from conversations, builds a knowledge graph, and retrieves relevant memories using 6-signal fusion search. It handles temporal reasoning, knowledge updates, and contradiction resolution.

## Architecture

```
Conversation ──→ Extraction Pipeline ──→ Facts + Entities + Edges
                  │                        │
                  ├─ Sliding Window         ├─ Atomic facts with source chunks
                  ├─ LLM Fact Extraction    ├─ Named entities + relationships
                  ├─ Dedup + Contradiction  ├─ Temporal grounding (eventDate/documentDate)
                  └─ Relational Versioning  └─ Knowledge chains (updates/extends/derives)

Query ──→ 6-Signal Retrieval ──→ Ranked Results
           │
           ├─ Vector similarity (0.30)
           ├─ Keyword/FTS (0.15)
           ├─ Graph traversal (0.15)
           ├─ Recency decay (0.10)
           ├─ Salience scoring (0.10)
           └─ Temporal proximity (0.20)
```

## Quick Start — Claude Code MCP

Add Steno as an MCP server in Claude Code:

```json
{
  "mcpServers": {
    "steno-memory": {
      "command": "npx",
      "args": ["tsx", "/path/to/steno/packages/mcp-server/src/local.ts"],
      "env": {
        "OPENAI_API_KEY": "sk-...",
        "STENO_DB_PATH": "~/.steno/memory.db"
      }
    }
  }
}
```

For the Claude Desktop app, add the same config to `~/Library/Application Support/Claude/claude_desktop_config.json`.

### MCP Tools

- **`steno_remember`** — Store a memory from conversation context
- **`steno_recall`** — Search memories with 6-signal fusion retrieval
- **`steno_feedback`** — Mark a memory as useful/not useful
- **`steno_stats`** — View memory statistics

## Packages

| Package | Description |
|---------|-------------|
| `@steno-ai/engine` | Core extraction pipeline, retrieval, knowledge graph |
| `@steno-ai/sdk` | TypeScript SDK for the Steno API |
| `@steno-ai/mcp` | MCP server for Claude Code / Claude Desktop |
| `@steno-ai/sqlite-adapter` | Local SQLite storage backend |
| `@steno-ai/supabase-adapter` | Supabase/PostgreSQL storage backend |
| `@steno-ai/graph` | Knowledge graph visualization (React + Three.js) |
| `@steno-ai/vercel-provider` | Vercel AI SDK middleware for automatic memory |
| `@steno-ai/local` | Zero-config local setup (SQLite + local embeddings) |

## Key Features

### Extraction Pipeline

- **Sliding window inference** — Splits conversations into overlapping segments with context windows for pronoun and temporal reference resolution
- **Two-pass LLM extraction** — Pass 1 extracts atomic facts, Pass 2 builds knowledge graph (entities + edges)
- **Structured temporal grounding** — Every fact gets `eventDate` (when the event happened) and `documentDate` (when the conversation occurred)
- **Source chunk preservation** — Each extracted fact retains the original conversation chunk it came from, enabling "search on facts, answer with full context"

### Retrieval

- **6-signal fusion** — Vector similarity, keyword/FTS, graph traversal, recency decay, salience scoring, and temporal proximity are fused with configurable weights
- **Triple-tier pre-fusion reranking** — Vector and graph candidates are independently re-ranked by embedding similarity before fusion
- **Temporal scoring** — Queries with time references ("what did I do in February?", "which happened first?") boost facts with matching `eventDate`
- **Knowledge chain resolution** — When a newer fact `updates` an older one, the stale fact is suppressed in results

### Knowledge Graph

- **Git-style append-only versioning** — Facts are never deleted, only superseded. Full history is preserved.
- **Relational versioning** — `updates`, `extends`, and `derives` edges track how knowledge evolves over time
- **Entity linking** — Facts are linked to named entities with typed relationships
- **Contradiction detection** — Conflicting facts are identified and surfaced with timeline context

## Configuration

```typescript
import { StenoConfigSchema } from '@steno-ai/engine';

const config = StenoConfigSchema.parse({
  embeddingModel: 'text-embedding-3-small',
  embeddingDim: 1536,
  decayHalfLifeDays: 30,
  retrievalWeights: {
    vector: 0.30,
    keyword: 0.15,
    graph: 0.15,
    recency: 0.10,
    salience: 0.10,
    temporal: 0.20,
  },
});
```

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm -r build

# Run tests
pnpm -r test

# Run engine tests only
cd packages/engine && bun test
```

## License

MIT

# @steno-ai/mcp

MCP server that gives Claude persistent long-term memory. Works with Claude Desktop, Claude Code, Cursor, Windsurf, and any MCP-compatible client.

## Setup

### 1. Get your keys

You need a [Supabase](https://supabase.com) project and an [OpenAI](https://platform.openai.com) API key. Optionally a [Perplexity](https://perplexity.ai) key for cheaper embeddings.

### 2. Run the Supabase migrations

Clone the repo and run the schema migrations against your Supabase project:

```bash
git clone https://github.com/SankrityaT/steno-ai.git
cd steno-ai/packages/supabase-adapter/src/migrations
# Run each .sql file (001-025) in order via Supabase SQL Editor or CLI
```

### 3. Add to Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "steno": {
      "command": "npx",
      "args": ["-y", "@steno-ai/mcp"],
      "env": {
        "SUPABASE_URL": "https://YOUR-PROJECT.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "eyJ...",
        "OPENAI_API_KEY": "sk-...",
        "PERPLEXITY_API_KEY": "pplx-... (optional)"
      }
    }
  }
}
```

### 4. Restart Claude Desktop

The MCP server will connect automatically. Claude gets 5 memory tools:

| Tool | Description |
|------|-------------|
| `steno_remember` | Store facts, preferences, decisions, people, events |
| `steno_recall` | Search memory with 6-signal fusion retrieval |
| `steno_flush` | Force extraction of buffered session messages |
| `steno_feedback` | Rate whether a recalled memory was useful |
| `steno_stats` | View memory statistics |

## How it works

Every `steno_remember` call runs through the full extraction pipeline:
- **LLM fact extraction** with temporal grounding (eventDate + documentDate)
- **Knowledge graph** building (entities, typed edges, domain-scoped schemas)
- **Dedup + knowledge updates** (newer facts supersede older ones)
- **Contextual embeddings** (facts embedded with conversation context)
- **Session buffering** (messages batched for cross-message context)

Every `steno_recall` query uses **6-signal fusion**:
- Vector similarity (0.30) — semantic search
- Temporal proximity (0.20) — date-aware retrieval
- Graph traversal (0.15) — entity relationships
- Keyword/FTS (0.15) — exact term matching
- Recency decay (0.10) — prefer recent memories
- Salience (0.10) — importance × access frequency

## Claude Code

Works the same way — add to your Claude Code MCP config or install as a plugin.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `OPENAI_API_KEY` | Yes | OpenAI API key (for LLM extraction) |
| `PERPLEXITY_API_KEY` | No | Perplexity key for cheaper embeddings |
| `STENO_SCOPE_ID` | No | Scope identifier (default: "default") |

## Part of [Steno](https://github.com/SankrityaT/steno-ai)

The memory layer for AI agents. 13 packages — engine, adapters, SDK, MCP server, and more.

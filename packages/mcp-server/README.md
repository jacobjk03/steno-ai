# @steno-ai/mcp

Persistent long-term memory for Claude. One command to set up. Works with Claude Desktop, Claude Code, Cursor, and any MCP client.

## Quick Start (2 minutes)

### 1. Create a free Supabase project

Go to [supabase.com](https://supabase.com), create a new project. Copy your:
- **Project URL** (looks like `https://abc123.supabase.co`)
- **Service Role Key** (in Settings > API > service_role key — NOT the anon key)

### 2. Get an OpenAI key

Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys), create a key.

### 3. Run setup

```bash
npx steno-mcp-init
```

This will:
- Ask for your Supabase URL, Service Role Key, and OpenAI key
- Create all database tables automatically
- Write the Claude Desktop config for you

### 4. Restart Claude Desktop

Quit (Cmd+Q) and reopen. Then:
- Go to **Settings > General** → set **"Tools already loaded"**
- Start chatting — Claude now has persistent memory

That's it. Your data stays in YOUR Supabase project. Nothing is shared.

---

## What you get

| Tool | What it does |
|------|-------------|
| `steno_remember` | Stores facts, preferences, decisions, people, events |
| `steno_recall` | Searches memory with 6-signal fusion (vector + keyword + graph + temporal + recency + salience) |
| `steno_flush` | Forces extraction of buffered session messages |
| `steno_feedback` | Rates whether a recalled memory was useful |
| `steno_stats` | Shows memory statistics |

## How it works

**Storing memories:** Every message goes through LLM extraction → entity/edge creation → temporal grounding → contextual embedding → dedup → knowledge graph update.

**Recalling memories:** Every query runs through 6 parallel signals fused with configurable weights. Knowledge updates are tracked — newer facts supersede older ones.

**Features:**
- Knowledge graph with typed entities and relationships
- Temporal reasoning (eventDate + documentDate on every fact)
- Knowledge updates (newer facts automatically supersede older ones)
- Domain-scoped entity types (vehicle, startup, project — or define your own)
- Session buffering for cross-message context
- Source chunk preservation for full-context answers

## Manual Setup (if you prefer)

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
        "PERPLEXITY_API_KEY": "pplx-... (optional, for cheaper embeddings)"
      }
    }
  }
}
```

Then run the migrations manually — see [migrations folder](https://github.com/SankrityaT/steno-ai/tree/main/packages/supabase-adapter/src/migrations).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (not anon key) |
| `OPENAI_API_KEY` | Yes | For LLM extraction and embeddings |
| `PERPLEXITY_API_KEY` | No | Cheaper embeddings ($0.03/1M tokens vs $0.13) |
| `STENO_SCOPE_ID` | No | Scope identifier (default: "default") |

## For Developers

Use the engine directly in your app:

```bash
npm install @steno-ai/engine @steno-ai/supabase-adapter @steno-ai/openai-adapter
```

```typescript
import { runExtractionPipeline, search } from '@steno-ai/engine';
import { SupabaseStorageAdapter } from '@steno-ai/supabase-adapter';
import { OpenAILLMAdapter } from '@steno-ai/openai-adapter';
```

See [@steno-ai/engine](https://www.npmjs.com/package/@steno-ai/engine) for full API docs.

## Part of [Steno](https://github.com/SankrityaT/steno-ai)

The memory layer for AI agents. 13 packages — engine, adapters, SDK, MCP server, and more.

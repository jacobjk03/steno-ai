# @steno-ai/mcp

MCP server for Claude Desktop, Claude Code, and other MCP clients. Gives Claude persistent memory across conversations.

## Install

```bash
npm install -g @steno-ai/mcp
```

## Claude Desktop Setup

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "steno": {
      "command": "npx",
      "args": ["-y", "@steno-ai/mcp"],
      "env": {
        "STENO_API_KEY": "sk_steno_..."
      }
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `steno_remember` | Remember information about a user or topic |
| `steno_recall` | Recall relevant memories by query |
| `steno_feedback` | Rate whether a recalled memory was useful |
| `steno_profile` | Get a structured profile of a user |
| `steno_graph` | Explore entity relationships in the knowledge graph |

## Usage

```bash
export STENO_API_KEY=sk_steno_...
npx @steno-ai/mcp
```

## Part of [Steno](https://github.com/SankrityaT/steno-ai)

The memory layer for AI agents.

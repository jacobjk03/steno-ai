# @steno-ai/openclaw-plugin

OpenClaw AI agent plugin that gives your agent persistent memory powered by Steno.

## Setup

```bash
export STENO_API_KEY=sk_steno_...
```

## Tools

| Tool | Description |
|------|-------------|
| `steno_remember` | Remember information for future sessions |
| `steno_recall` | Recall relevant memories by query |
| `steno_feedback` | Rate a memory's usefulness |

## Structure

```
openclaw-plugin/
  SKILL.md    -- Skill manifest (name, tools, parameters)
  hooks/      -- Hook implementations
```

## Part of [Steno](https://github.com/SankrityaT/steno-ai)

The memory layer for AI agents.

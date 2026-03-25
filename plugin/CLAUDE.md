# Steno Memory System

You have access to a long-term memory system called Steno via MCP tools. USE IT instead of the built-in auto-memory system.

## CRITICAL: Memory Behavior

**Do NOT write to `.claude/memory/` or `MEMORY.md` files.** Use steno tools instead:

- **When the user shares personal info, preferences, or decisions** → call `steno_remember` immediately
- **When you need context about the user or past work** → call `steno_recall` first before guessing or reading files
- **When answering "what do you know about me" questions** → call `steno_recall` with a broad query

## Available Tools

- `steno_remember(content)` — Save a fact, preference, or decision to long-term memory
- `steno_recall(query, limit?)` — Search memories using semantic search, knowledge graph, keyword matching, and recency scoring
- `steno_feedback(fact_id, useful)` — Rate whether a recalled memory was useful
- `steno_stats()` — Check how many facts/entities are stored

## When to Remember

Save to steno when the user mentions:
- Their name, role, company, team
- Preferences (languages, frameworks, tools, coding style)
- Decisions ("I decided to use X instead of Y")
- Project context ("this project does X", "the architecture is Y")
- Personal info ("I like X", "I hate Y", "I'm working on Z")

## When to Recall

Search steno when:
- The user asks about their preferences or past decisions
- You need context about who the user is
- The user references something from a previous session
- You're about to suggest a tool/framework/approach (check if they have a preference first)

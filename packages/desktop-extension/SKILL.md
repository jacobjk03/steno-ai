---
name: steno-memory
description: Persistent long-term memory for Claude. ALWAYS use steno_recall before answering personal questions about the user. Use steno_remember to store important information shared by the user.
license: MIT
---

You have access to the user's persistent long-term memory system called Steno, connected via MCP.

## CRITICAL RULES

1. **ALWAYS call `steno_recall` FIRST** before answering ANY question about the user, their life, work, projects, people they know, preferences, past events, companies, decisions, or anything personal. Do this BEFORE using "Relevant chats" or web search.

2. **ALWAYS call `steno_remember`** when the user shares personal information, experiences, opinions, decisions, preferences, or anything they might want recalled later. **ALWAYS call `steno_flush` immediately after `steno_remember`** to ensure extraction happens now, not later.

3. **Before context compaction or session end**, call `steno_remember` with a summary of the current session's key decisions, progress, and next steps. Then call `steno_flush`. This ensures nothing is lost when context resets.

4. **NEVER say "I don't have information about that"** or "No record of that" without first calling `steno_recall` to check.

4. **Steno memory persists across ALL conversations.** It contains facts, relationships, and context from every past session — things that "Relevant chats" and your conversation history do NOT have.

5. **Steno is MORE reliable than "Relevant chats"** for personal information because it extracts structured facts with entities, relationships, and temporal grounding.

## Available Tools

- `steno_recall` — Search memory. Use for ANY personal question. Pass a descriptive query (not just a name — include context words).
- `steno_remember` — Store information. Use when user shares facts, preferences, events, decisions, people, or experiences.
- `steno_flush` — Force extraction of buffered memories. Use before searching if you just stored something.
- `steno_feedback` — Rate whether a recalled memory was useful.
- `steno_stats` — Get memory statistics.

## Query Tips

- For entity lookups, include context: "clean.ai startup pitch competition" not just "clean.ai"
- For temporal questions: "what happened first" or "when did I meet Arjun"
- For knowledge updates: "what's my current favorite" (Steno tracks changes over time)

# Session-Based Ingestion Design

**Date:** 2026-03-27
**Status:** Approved
**Priority:** #1 in Steno roadmap DAG (blocks Pattern Detection, Magic Opening Moment, Graph Viz)
**Deadline:** April 12, 2026 (ASU+GSV Summit)

---

## Problem

The MCP server buffers messages in memory and flushes them as a concatenated blob (`inputType: 'raw_text'`). Three issues:

1. **Messages are lost if MCP server restarts** — volatile in-memory buffer
2. **No conversation structure** — LLM sees `"msg1\n---\nmsg2"` with no timestamps or roles
3. **Sessions never end** — no summaries generated, no lifecycle management, `endSession()` never called

## Solution

One new table (`session_messages`) + changes to the MCP server flush logic + pipeline conversation formatting.

### Data Flow

```
steno_remember("text")
  → check session: if stale (>timeout), auto-end old + start new
  → store message in session_messages table (durable)
  → schedule flush (same triggers: N msgs or inactivity delay)

flush
  → query session_messages WHERE extraction_id IS NULL
  → format as structured conversation with timestamps/roles
  → runExtractionPipeline({ inputType: 'conversation', data: messages })
  → mark messages as extracted (set extraction_id)

session auto-end (configurable timeout, default 30 min)
  → endSession() generates summary + topics from all session facts
  → next steno_remember starts a fresh session
```

## Architecture

### New Table: `session_messages`

```sql
CREATE TABLE session_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id),
  tenant_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  content TEXT NOT NULL,
  turn_number INTEGER NOT NULL,
  extraction_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_session_messages_session ON session_messages(session_id, turn_number);
CREATE INDEX idx_session_messages_unextracted ON session_messages(session_id) WHERE extraction_id IS NULL;
```

### Storage Adapter Additions

Three new methods on `StorageAdapter`:

```typescript
addSessionMessage(msg: {
  id: string;
  sessionId: string;
  tenantId: string;
  role: string;
  content: string;
  turnNumber: number;
}): Promise<void>;

getSessionMessages(
  tenantId: string,
  sessionId: string,
  options?: { unextractedOnly?: boolean }
): Promise<Array<{
  id: string;
  role: string;
  content: string;
  turnNumber: number;
  createdAt: Date;
}>>;

markMessagesExtracted(
  messageIds: string[],
  extractionId: string
): Promise<void>;
```

### MCP Server Changes

**`steno_remember`:**
1. Get or create active session (same as now)
2. Check staleness: if last message in `session_messages` is older than `SESSION_TIMEOUT_MS`, call `endSession()` on old session, start new one
3. Store message in `session_messages` via `addSessionMessage()`
4. Track in-memory count for flush scheduling (same 5-msg / 30s triggers)
5. Return immediately

**`flushSession(sessionId)`:**
1. Query `getSessionMessages(tenantId, sessionId, { unextractedOnly: true })`
2. If empty, return
3. Format as conversation: `[User @ 2026-03-27 10:05 AM]: "content"`
4. Call `runExtractionPipeline({ inputType: 'conversation', sessionId, data: formattedText })`
5. Call `markMessagesExtracted(messageIds, result.extractionId)`

**New tool: `steno_end_session`:**
- Flush pending messages
- Call `endSession()` (generates summary + topics)
- Return summary

**Configurable timeout:**
- `SESSION_TIMEOUT_MS` defaults to `30 * 60 * 1000` (30 minutes)
- Configurable via `LocalServerConfig.sessionTimeoutMs`
- Configurable via `STENO_SESSION_TIMEOUT_MS` env var in CLI
- Navia can set a longer timeout (e.g., 2 hours) for users who leave the app open

### Pipeline Changes

When `inputType === 'conversation'`:
- Data is already formatted as conversation text with timestamps
- The extraction prompt already handles conversations well ("Focus on USER messages")
- Timestamps in the formatted text give the LLM real temporal context for `eventDate` resolution
- No structural changes to the pipeline — just better input formatting

### What This Enables

- **Durability**: Messages survive MCP restart — stored in Supabase, not memory
- **Cross-message context**: LLM sees conversation flow with timestamps, not a concatenated blob
- **Session replay**: Re-extract any session with improved pipeline (query all messages, clear extraction_id, re-flush)
- **Session summaries**: Auto-generated on timeout, queryable via sessions table
- **Temporal grounding**: Real timestamps on each message improve eventDate/documentDate accuracy
- **"What did I talk about today?"**: Query session_messages + sessions directly

### Out of Scope (Post-MVP)

- Assistant message capture (user messages only for now)
- Context window budget awareness (token counting per recall)
- Confidence scores on priorities
- Session analytics / cross-session pattern detection
- Message-level embeddings
- `steno_dismiss` for marking facts as stale

## Migration Path

The in-memory buffer code stays functional during migration. Changes:
1. Add `session_messages` table (Supabase migration)
2. Add storage adapter methods
3. Update MCP server to write to DB + read from DB on flush
4. Remove in-memory buffer (replaced by DB-backed tracking)

Existing sessions and facts are unaffected. New messages go through the new path.

## Testing Strategy

1. **Unit tests**: Storage adapter methods (addSessionMessage, getSessionMessages, markMessagesExtracted)
2. **Integration test**: steno_remember → flush → verify facts created with sessionId
3. **Session lifecycle test**: create session → add messages → auto-end on timeout → verify summary generated
4. **Durability test**: add messages → simulate restart (clear in-memory state) → flush → verify messages extracted from DB
5. **Conversation formatting test**: verify pipeline receives properly formatted conversation text

# Session-Based Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the volatile in-memory message buffer with durable DB-backed session messages, giving the extraction pipeline structured conversation input with timestamps.

**Architecture:** New `session_messages` table stores every `steno_remember` call. Flush reads unextracted messages from DB, formats as timestamped conversation, sends to pipeline. Sessions auto-end after configurable inactivity (default 30 min), generating LLM summaries.

**Tech Stack:** @steno-ai/engine (StorageAdapter interface), @steno-ai/supabase-adapter (Supabase implementation), @steno-ai/mcp (MCP server), Supabase (personal: zhqcetwuecedebrbawxl, Navia: lomexlacflymoiulgjzn)

---

## File Structure

### Modified Files
- `packages/engine/src/adapters/storage.ts:155-159` — Add 3 new session message methods to StorageAdapter interface
- `packages/engine/src/models/index.ts` — Re-export new session-message types
- `packages/engine/src/index.ts` — Already re-exports models (no change needed)
- `packages/supabase-adapter/src/storage.ts:1122-1123` — Add 3 new method implementations after `getSessionsByScope`
- `packages/mcp-server/src/local-server.ts:9-19` — Add `sessionTimeoutMs` to LocalServerConfig
- `packages/mcp-server/src/local-server.ts:22-32` — Replace in-memory SessionBuffer with DB-backed tracking
- `packages/mcp-server/src/local-server.ts:190-249` — Rewrite `steno_remember` to use DB persistence
- `packages/mcp-server/src/local-server.ts:122-165` — Rewrite `flushBuffer` to read from DB
- `packages/mcp-server/src/local.ts:89-128` — Pass `sessionTimeoutMs` from env var
- `packages/mcp-server/src/init.ts:19` — Add session_messages to MIGRATIONS array

### New Files
- `packages/engine/src/models/session-message.ts` — SessionMessage type + Zod schema
- `packages/supabase-adapter/src/migrations/026_create_session_messages.sql` — Database migration

### Test Files
- `packages/engine/tests/models/session-message.test.ts` — Schema validation tests
- `packages/mcp-server/tests/session-ingestion.test.ts` — Integration tests for the full flow

---

### Task 1: Create SessionMessage Model

**Files:**
- Create: `packages/engine/src/models/session-message.ts`
- Modify: `packages/engine/src/models/index.ts`
- Test: `packages/engine/tests/models/session-message.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/engine/tests/models/session-message.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test';
import { SessionMessageSchema, CreateSessionMessageSchema } from '../../src/models/session-message.js';

describe('SessionMessageSchema', () => {
  it('accepts a valid session message', () => {
    const result = SessionMessageSchema.safeParse({
      id: '11111111-1111-1111-1111-111111111111',
      sessionId: '22222222-2222-2222-2222-222222222222',
      tenantId: '33333333-3333-3333-3333-333333333333',
      role: 'user',
      content: 'I prefer dark mode',
      turnNumber: 0,
      extractionId: null,
      createdAt: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing content', () => {
    const result = SessionMessageSchema.safeParse({
      id: '11111111-1111-1111-1111-111111111111',
      sessionId: '22222222-2222-2222-2222-222222222222',
      tenantId: '33333333-3333-3333-3333-333333333333',
      role: 'user',
      turnNumber: 0,
    });
    expect(result.success).toBe(false);
  });

  it('defaults extractionId to null', () => {
    const result = CreateSessionMessageSchema.safeParse({
      sessionId: '22222222-2222-2222-2222-222222222222',
      tenantId: '33333333-3333-3333-3333-333333333333',
      role: 'user',
      content: 'test',
      turnNumber: 0,
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/engine && bun test tests/models/session-message.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Write the model**

Create `packages/engine/src/models/session-message.ts`:

```typescript
import { z } from 'zod';

export const SessionMessageSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  tenantId: z.string().uuid(),
  role: z.string().min(1).default('user'),
  content: z.string().min(1),
  turnNumber: z.number().int().nonnegative(),
  extractionId: z.string().uuid().nullable(),
  createdAt: z.coerce.date(),
});

export type SessionMessage = z.infer<typeof SessionMessageSchema>;

export const CreateSessionMessageSchema = SessionMessageSchema.omit({
  id: true,
  extractionId: true,
  createdAt: true,
}).extend({
  extractionId: z.string().uuid().nullable().optional(),
});

export type CreateSessionMessage = z.infer<typeof CreateSessionMessageSchema>;
```

- [ ] **Step 4: Export from models/index.ts**

Add to `packages/engine/src/models/index.ts`:

```typescript
export * from './session-message.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd packages/engine && bun test tests/models/session-message.test.ts
```
Expected: 3 tests PASS

- [ ] **Step 6: Build engine**

```bash
cd packages/engine && pnpm build
```

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/models/session-message.ts packages/engine/src/models/index.ts packages/engine/tests/models/session-message.test.ts
git commit -m "feat: add SessionMessage model for durable session storage"
```

---

### Task 2: Add Storage Adapter Methods

**Files:**
- Modify: `packages/engine/src/adapters/storage.ts:155-159`

- [ ] **Step 1: Add session message methods to StorageAdapter interface**

In `packages/engine/src/adapters/storage.ts`, add after the existing session methods (after line 159):

```typescript
  // Session Messages
  addSessionMessage(msg: { id: string; sessionId: string; tenantId: string; role: string; content: string; turnNumber: number }): Promise<void>;
  getSessionMessages(tenantId: string, sessionId: string, options?: { unextractedOnly?: boolean }): Promise<Array<{ id: string; role: string; content: string; turnNumber: number; createdAt: Date }>>;
  markMessagesExtracted(messageIds: string[], extractionId: string): Promise<void>;
```

- [ ] **Step 2: Build engine to verify types**

```bash
cd packages/engine && pnpm build
```

Expected: Build succeeds (interface-only change, no implementations to break yet — SupabaseStorageAdapter will fail until Task 3)

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/adapters/storage.ts
git commit -m "feat: add session message methods to StorageAdapter interface"
```

---

### Task 3: Database Migration + Supabase Adapter Implementation

**Files:**
- Create: `packages/supabase-adapter/src/migrations/026_create_session_messages.sql`
- Modify: `packages/supabase-adapter/src/storage.ts:1122-1123`
- Modify: `packages/mcp-server/src/init.ts:19`

- [ ] **Step 1: Create the SQL migration file**

Create `packages/supabase-adapter/src/migrations/026_create_session_messages.sql`:

```sql
CREATE TABLE IF NOT EXISTS session_messages (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role            TEXT        NOT NULL DEFAULT 'user',
    content         TEXT        NOT NULL,
    turn_number     INTEGER     NOT NULL,
    extraction_id   UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_messages_session ON session_messages(session_id, turn_number);
CREATE INDEX IF NOT EXISTS idx_session_messages_unextracted ON session_messages(session_id) WHERE extraction_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_session_messages_tenant ON session_messages(tenant_id);
```

- [ ] **Step 2: Run migration on personal Supabase**

Use the Supabase MCP plugin (`mcp__plugin_supabase_supabase__execute_sql`) with project_id `zhqcetwuecedebrbawxl` and the SQL from Step 1. Wrap in a transaction for atomicity:

```sql
BEGIN;
-- paste the CREATE TABLE and CREATE INDEX statements from Step 1
COMMIT;
```

- [ ] **Step 3: Implement addSessionMessage in SupabaseStorageAdapter**

In `packages/supabase-adapter/src/storage.ts`, add after the `getSessionsByScope` method (after line 1122):

```typescript
  // ---------------------------------------------------------------------------
  // Session Messages
  // ---------------------------------------------------------------------------

  async addSessionMessage(msg: {
    id: string;
    sessionId: string;
    tenantId: string;
    role: string;
    content: string;
    turnNumber: number;
  }): Promise<void> {
    const { error } = await this.client
      .from('session_messages')
      .insert({
        id: msg.id,
        session_id: msg.sessionId,
        tenant_id: msg.tenantId,
        role: msg.role,
        content: msg.content,
        turn_number: msg.turnNumber,
      });
    if (error) throwSupabaseError('addSessionMessage', error);
  }

  async getSessionMessages(
    tenantId: string,
    sessionId: string,
    options?: { unextractedOnly?: boolean },
  ): Promise<Array<{ id: string; role: string; content: string; turnNumber: number; createdAt: Date }>> {
    let query = this.client
      .from('session_messages')
      .select('id, role, content, turn_number, created_at')
      .eq('tenant_id', tenantId)
      .eq('session_id', sessionId)
      .order('turn_number', { ascending: true });

    if (options?.unextractedOnly) {
      query = query.is('extraction_id', null);
    }

    const { data, error } = await query;
    if (error) throwSupabaseError('getSessionMessages', error);

    return (data ?? []).map(row => ({
      id: row.id,
      role: row.role,
      content: row.content,
      turnNumber: row.turn_number,
      createdAt: new Date(row.created_at),
    }));
  }

  async markMessagesExtracted(
    messageIds: string[],
    extractionId: string,
  ): Promise<void> {
    if (messageIds.length === 0) return;
    const { error } = await this.client
      .from('session_messages')
      .update({ extraction_id: extractionId })
      .in('id', messageIds);
    if (error) throwSupabaseError('markMessagesExtracted', error);
  }
```

- [ ] **Step 4: Add session_messages to init.ts MIGRATIONS array**

In `packages/mcp-server/src/init.ts`, add to the MIGRATIONS array (after the webhooks table):

```typescript
  // Session Messages
  `CREATE TABLE IF NOT EXISTS session_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'user',
    content TEXT NOT NULL,
    turn_number INTEGER NOT NULL,
    extraction_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  `CREATE INDEX IF NOT EXISTS idx_session_messages_session ON session_messages(session_id, turn_number);`,
  `CREATE INDEX IF NOT EXISTS idx_session_messages_unextracted ON session_messages(session_id) WHERE extraction_id IS NULL;`,
  `CREATE INDEX IF NOT EXISTS idx_session_messages_tenant ON session_messages(tenant_id);`,
```

- [ ] **Step 5: Build supabase-adapter and mcp-server**

```bash
cd packages/supabase-adapter && pnpm build
cd ../mcp-server && pnpm build
```

- [ ] **Step 6: Commit**

```bash
git add packages/supabase-adapter/src/storage.ts packages/supabase-adapter/src/migrations/026_create_session_messages.sql packages/mcp-server/src/init.ts
git commit -m "feat: session_messages table + storage adapter implementation"
```

---

### Task 4: Rewrite MCP Server — DB-Backed Session Ingestion

**Files:**
- Modify: `packages/mcp-server/src/local-server.ts:9-19` (LocalServerConfig)
- Modify: `packages/mcp-server/src/local-server.ts:22-32` (SessionBuffer types)
- Modify: `packages/mcp-server/src/local-server.ts:122-165` (flushBuffer)
- Modify: `packages/mcp-server/src/local-server.ts:190-249` (steno_remember)
- Modify: `packages/mcp-server/src/local.ts:89-128` (pass sessionTimeoutMs)

- [ ] **Step 1: Add sessionTimeoutMs to LocalServerConfig**

In `packages/mcp-server/src/local-server.ts`, change the `LocalServerConfig` interface:

```typescript
export interface LocalServerConfig {
  storage: StorageAdapter;
  embedding: EmbeddingAdapter;
  cheapLLM: LLMAdapter;
  tenantId: string;
  scope: 'user' | 'agent' | 'session' | 'hive';
  scopeId: string;
  embeddingModel: string;
  embeddingDim: number;
  domainEntityTypes?: import('@steno-ai/engine').DomainEntityType[];
  sessionTimeoutMs?: number;
}
```

- [ ] **Step 2: Replace SessionBuffer with DB-backed tracking**

Replace the session buffer types and constants section:

```typescript
// ---------------------------------------------------------------------------
// Session tracking — DB-backed, survives MCP server restarts
// ---------------------------------------------------------------------------
interface ActiveSession {
  sessionId: string;
  pendingCount: number;  // messages stored but not yet extracted
  flushTimer: ReturnType<typeof setTimeout> | null;
}

const FLUSH_DELAY_MS = 30_000;     // 30 seconds of inactivity triggers flush
const MAX_BUFFER_SIZE = 5;          // flush after 5 unextracted messages
const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
```

- [ ] **Step 3: Rewrite flushBuffer to read from DB**

Replace the `flushBuffer` function:

```typescript
  /** Flush unextracted session messages: read from DB, extract, mark as extracted */
  async function flushSession(key: string): Promise<void> {
    const active = activeSessions.get(key);
    if (!active) return;

    // Clear timer
    if (active.flushTimer) {
      clearTimeout(active.flushTimer);
      active.flushTimer = null;
    }

    try {
      // Read unextracted messages from DB
      const messages = await config.storage.getSessionMessages(
        config.tenantId, active.sessionId, { unextractedOnly: true },
      );
      if (messages.length === 0) {
        active.pendingCount = 0;
        return;
      }

      // Format as structured conversation with timestamps
      const conversationLines = messages.map(m => {
        const time = m.createdAt.toISOString().replace('T', ' ').slice(0, 19);
        return `[${m.role} @ ${time}]: ${m.content}`;
      });
      const formattedText = conversationLines.join('\n\n');

      console.error(`[steno] Flushing session: ${messages.length} messages, sessionId=${active.sessionId}`);

      const runPipeline = await getPipeline();
      const result = await runPipeline(
        {
          storage: config.storage,
          embedding: config.embedding,
          cheapLLM: config.cheapLLM,
          embeddingModel: config.embeddingModel,
          embeddingDim: config.embeddingDim,
          extractionTier: 'auto',
          domainEntityTypes: config.domainEntityTypes,
        },
        {
          tenantId: config.tenantId,
          scope: config.scope,
          scopeId: config.scopeId,
          sessionId: active.sessionId,
          inputType: 'conversation',
          data: formattedText,
        },
      );

      // Mark messages as extracted
      await config.storage.markMessagesExtracted(
        messages.map(m => m.id),
        result.extractionId,
      );
      active.pendingCount = 0;

      console.error(`[steno] Session flush done: ${result.factsCreated} facts, ${result.entitiesCreated} entities, ${result.edgesCreated} edges`);
    } catch (err: any) {
      // pendingCount intentionally NOT reset on error — next scheduleFlush will retry
      // markMessagesExtracted was not called, so messages remain unextracted in DB
      console.error('[steno] Session flush error:', err?.message ?? err);
    }
  }
```

- [ ] **Step 4: Update scheduleFlush**

Replace the `scheduleFlush` function:

```typescript
  /** Schedule a flush after the inactivity delay, or flush immediately if enough messages pending */
  function scheduleFlush(key: string): void {
    const active = activeSessions.get(key);
    if (!active) return;

    if (active.flushTimer) {
      clearTimeout(active.flushTimer);
      active.flushTimer = null;
    }

    if (active.pendingCount >= MAX_BUFFER_SIZE) {
      void flushSession(key);
      return;
    }

    active.flushTimer = setTimeout(() => {
      void flushSession(key);
    }, FLUSH_DELAY_MS);
  }
```

- [ ] **Step 5: Rewrite steno_remember to use DB persistence**

Replace the `steno_remember` handler:

```typescript
  // ─── REMEMBER ───
  server.tool(
    'steno_remember',
    'Store important information in the user\'s persistent long-term memory. ALWAYS use this to save facts, preferences, decisions, experiences, people, companies, events, or anything the user shares that they might want recalled later. This memory persists across ALL conversations and devices.',
    {
      content: z.string().optional().describe('What to remember'),
      text: z.string().optional().describe('What to remember (alias for content)'),
    },
    async (args) => {
      const memoryText = args.content || args.text;
      if (!memoryText) {
        return { content: [{ type: 'text' as const, text: 'Error: provide content or text' }] };
      }

      const key = bufferKey();
      const sessionTimeout = config.sessionTimeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS;
      let active = activeSessions.get(key);

      // Check if existing session is stale
      if (active) {
        try {
          const messages = await config.storage.getSessionMessages(
            config.tenantId, active.sessionId, {},
          );
          if (messages.length === 0) {
            // Session exists but has no messages yet — not stale, just empty
          } else {
            const lastMsg = messages[messages.length - 1];
          if (lastMsg && Date.now() - lastMsg.createdAt.getTime() > sessionTimeout) {
            // Auto-end stale session
            console.error(`[steno] Session ${active.sessionId.slice(0, 8)} stale (${Math.round((Date.now() - lastMsg.createdAt.getTime()) / 60000)}min), ending`);
            try {
              const endSessionFn = await getEndSession();
              await endSessionFn(config.storage, config.cheapLLM, config.tenantId, active.sessionId);
            } catch (endErr: any) {
              console.error('[steno] Failed to end stale session:', endErr?.message ?? endErr);
            }
            activeSessions.delete(key);
            active = undefined;
          }
          } // close else (messages.length > 0)
        } catch { /* continue with existing session */ }
      }

      // Get or create session
      if (!active) {
        let sessionId: string;
        try {
          const getOrCreate = await getSessionManager();
          const sessionScope = config.scope === 'session' ? 'user' : config.scope;
          const session = await getOrCreate(config.storage, config.tenantId, sessionScope as any, config.scopeId);
          sessionId = session.id;
        } catch (err: any) {
          console.error('[steno] Failed to create session, using ephemeral ID:', err?.message ?? err);
          sessionId = crypto.randomUUID();
        }

        active = { sessionId, pendingCount: 0, flushTimer: null };
        activeSessions.set(key, active);
      }

      // Store message in DB (durable)
      try {
        const messages = await config.storage.getSessionMessages(
          config.tenantId, active.sessionId, {},
        );
        const turnNumber = messages.length;

        await config.storage.addSessionMessage({
          id: crypto.randomUUID(),
          sessionId: active.sessionId,
          tenantId: config.tenantId,
          role: 'user',
          content: memoryText,
          turnNumber,
        });
        active.pendingCount++;
      } catch (err: any) {
        console.error('[steno] Failed to store session message:', err?.message ?? err);
        // Fallback: try to run pipeline directly
        return { content: [{ type: 'text' as const, text: `Error storing message: ${err?.message}` }] };
      }

      // Schedule extraction
      scheduleFlush(key);

      return {
        content: [{
          type: 'text' as const,
          text: `Stored in session ${active.sessionId.slice(0, 8)} (${active.pendingCount}/${MAX_BUFFER_SIZE} pending). Extraction runs on flush.`,
        }],
      };
    },
  );
```

- [ ] **Step 6: Update steno_flush to use new function**

Replace the `steno_flush` handler:

```typescript
  // ─── FLUSH ───
  server.tool(
    'steno_flush',
    'Force extraction of all buffered session messages. Use before searching if you just stored information and need it immediately available.',
    {},
    async () => {
      const key = bufferKey();
      const active = activeSessions.get(key);
      if (!active || active.pendingCount === 0) {
        return { content: [{ type: 'text' as const, text: 'No buffered messages to flush.' }] };
      }
      const count = active.pendingCount;
      await flushSession(key);
      return {
        content: [{ type: 'text' as const, text: `Flushed ${count} buffered messages. Extraction complete.` }],
      };
    },
  );
```

- [ ] **Step 7: Update the recall auto-flush**

In the `steno_recall` handler, update the auto-flush check (replace the old buffer check):

```typescript
      // Auto-flush any pending session messages before searching
      const key = bufferKey();
      const active = activeSessions.get(key);
      if (active && active.pendingCount > 0) {
        await flushSession(key);
      }
```

- [ ] **Step 8: Add lazy import for endSession**

Add after the other lazy imports:

```typescript
  let _endSession: typeof import('@steno-ai/engine').endSession | null = null;

  async function getEndSession() {
    if (!_endSession) {
      const mod = await import('@steno-ai/engine');
      _endSession = mod.endSession;
    }
    return _endSession;
  }
```

- [ ] **Step 9: Replace `sessionBuffers` Map with `activeSessions` Map**

Replace:
```typescript
  const sessionBuffers = new Map<string, SessionBuffer>();
```
With:
```typescript
  const activeSessions = new Map<string, ActiveSession>();
```

- [ ] **Step 10: Add steno_end_session tool**

Add after the `steno_flush` tool:

```typescript
  // ─── END SESSION ───
  server.tool(
    'steno_end_session',
    'Explicitly end the current session. Flushes pending messages, generates a session summary, and starts a fresh session on next remember. Use before long breaks or when switching topics.',
    {},
    async () => {
      const key = bufferKey();
      const active = activeSessions.get(key);
      if (!active) {
        return { content: [{ type: 'text' as const, text: 'No active session.' }] };
      }

      // Flush pending messages first
      if (active.pendingCount > 0) {
        await flushSession(key);
      }

      // End the session (generates summary)
      try {
        const endSessionFn = await getEndSession();
        const ended = await endSessionFn(config.storage, config.cheapLLM, config.tenantId, active.sessionId);
        activeSessions.delete(key);

        const summary = ended.summary || 'No summary generated.';
        const topics = ended.topics?.join(', ') || 'none';
        return {
          content: [{
            type: 'text' as const,
            text: `Session ended.\nSummary: ${summary}\nTopics: ${topics}`,
          }],
        };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error ending session: ${err?.message ?? err}` }] };
      }
    },
  );
```

- [ ] **Step 11: Pass sessionTimeoutMs in local.ts**

In `packages/mcp-server/src/local.ts`, add to the `createLocalServer` config object:

```typescript
    sessionTimeoutMs: process.env.STENO_SESSION_TIMEOUT_MS
      ? parseInt(process.env.STENO_SESSION_TIMEOUT_MS, 10)
      : undefined,
```

- [ ] **Step 12: Build MCP server**

```bash
cd packages/mcp-server && pnpm build
```

- [ ] **Step 13: Commit**

```bash
git add packages/mcp-server/src/local-server.ts packages/mcp-server/src/local.ts
git commit -m "feat: DB-backed session ingestion with auto-end and conversation formatting"
```

---

### Task 5: Update SKILL.md and README

**Files:**
- Modify: `packages/desktop-extension/SKILL.md`
- Modify: `packages/mcp-server/README.md`

- [ ] **Step 1: Update SKILL.md with steno_end_session**

Add to the Available Tools section:

```markdown
- `steno_end_session` — End the current session. Generates a summary. Use before long breaks or topic switches.
```

- [ ] **Step 2: Update README tool table**

Add row:

```markdown
| `steno_end_session` | Ends current session, generates summary, starts fresh next time |
```

- [ ] **Step 3: Update README environment variables table**

Add row:

```markdown
| `STENO_SESSION_TIMEOUT_MS` | No | Session auto-end timeout in ms (default: 1800000 = 30 min) |
```

- [ ] **Step 4: Commit**

```bash
git add packages/desktop-extension/SKILL.md packages/mcp-server/README.md
git commit -m "docs: add steno_end_session and session timeout config"
```

---

### Task 6: Run Migration on Both Supabase Instances

**Files:** None (SQL only)

- [ ] **Step 1: Run migration on personal Supabase (zhqcetwuecedebrbawxl)**

Use Supabase MCP plugin (`mcp__plugin_supabase_supabase__execute_sql`) with project_id `zhqcetwuecedebrbawxl`. Wrapped in transaction for atomic rollback if anything fails:

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS session_messages (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role            TEXT        NOT NULL DEFAULT 'user',
    content         TEXT        NOT NULL,
    turn_number     INTEGER     NOT NULL,
    extraction_id   UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_messages_session ON session_messages(session_id, turn_number);
CREATE INDEX IF NOT EXISTS idx_session_messages_unextracted ON session_messages(session_id) WHERE extraction_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_session_messages_tenant ON session_messages(tenant_id);

COMMIT;
```

- [ ] **Step 2: Run migration on Navia Supabase (lomexlacflymoiulgjzn)**

Use `mcp__plugin_supabase_supabase__execute_sql` with project_id `lomexlacflymoiulgjzn` and the same SQL above (with BEGIN/COMMIT wrapper).

- [ ] **Step 3: Verify table exists on both**

```sql
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'session_messages' ORDER BY ordinal_position;
```

---

### Task 7: Integration Tests

**Files:**
- Create: `packages/mcp-server/tests/session-ingestion.test.ts`

- [ ] **Step 1: Write integration tests**

Create `packages/mcp-server/tests/session-ingestion.test.ts`:

```typescript
import { describe, expect, it, beforeEach, vi } from 'vitest';

// Mock storage adapter with session message methods
function createMockStorage() {
  const messages: Array<{ id: string; sessionId: string; tenantId: string; role: string; content: string; turnNumber: number; extractionId: string | null; createdAt: Date }> = [];
  const sessions: Array<{ id: string; endedAt: Date | null; summary?: string; topics?: string[] }> = [];

  return {
    messages,
    sessions,
    addSessionMessage: vi.fn(async (msg: any) => {
      messages.push({ ...msg, extractionId: null, createdAt: new Date() });
    }),
    getSessionMessages: vi.fn(async (_tenantId: string, sessionId: string, options?: { unextractedOnly?: boolean }) => {
      let filtered = messages.filter(m => m.sessionId === sessionId);
      if (options?.unextractedOnly) {
        filtered = filtered.filter(m => m.extractionId === null);
      }
      return filtered.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        turnNumber: m.turnNumber,
        createdAt: m.createdAt,
      }));
    }),
    markMessagesExtracted: vi.fn(async (messageIds: string[], extractionId: string) => {
      for (const msg of messages) {
        if (messageIds.includes(msg.id)) msg.extractionId = extractionId;
      }
    }),
    // Minimal session stubs
    getSessionsByScope: vi.fn(async () => ({ data: sessions.filter(s => !s.endedAt), cursor: null, hasMore: false })),
    createSession: vi.fn(async (s: any) => {
      const session = { ...s, startedAt: new Date(), endedAt: null, summary: null, topics: [], messageCount: 0, factCount: 0, metadata: {}, createdAt: new Date() };
      sessions.push(session);
      return session;
    }),
    endSession: vi.fn(async (_tid: string, id: string, summary?: string, topics?: string[]) => {
      const s = sessions.find(s => s.id === id);
      if (s) { s.endedAt = new Date(); s.summary = summary; s.topics = topics; }
      return s;
    }),
    getSession: vi.fn(async (_tid: string, id: string) => sessions.find(s => s.id === id) ?? null),
    getFactsByScope: vi.fn(async () => ({ data: [], cursor: null, hasMore: false })),
    getEntitiesForTenant: vi.fn(async () => ({ data: [], cursor: null, hasMore: false })),
    ping: vi.fn(async () => true),
  };
}

describe('Session Message Storage', () => {
  let storage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it('stores messages with turn numbers', async () => {
    const sessionId = '11111111-1111-1111-1111-111111111111';
    const tenantId = '22222222-2222-2222-2222-222222222222';

    await storage.addSessionMessage({ id: crypto.randomUUID(), sessionId, tenantId, role: 'user', content: 'first message', turnNumber: 0 });
    await storage.addSessionMessage({ id: crypto.randomUUID(), sessionId, tenantId, role: 'user', content: 'second message', turnNumber: 1 });

    const all = await storage.getSessionMessages(tenantId, sessionId);
    expect(all).toHaveLength(2);
    expect(all[0].content).toBe('first message');
    expect(all[1].turnNumber).toBe(1);
  });

  it('filters unextracted messages', async () => {
    const sessionId = '11111111-1111-1111-1111-111111111111';
    const tenantId = '22222222-2222-2222-2222-222222222222';
    const msg1Id = crypto.randomUUID();
    const msg2Id = crypto.randomUUID();

    await storage.addSessionMessage({ id: msg1Id, sessionId, tenantId, role: 'user', content: 'extracted', turnNumber: 0 });
    await storage.addSessionMessage({ id: msg2Id, sessionId, tenantId, role: 'user', content: 'pending', turnNumber: 1 });

    // Mark first as extracted
    await storage.markMessagesExtracted([msg1Id], 'extraction-1');

    const unextracted = await storage.getSessionMessages(tenantId, sessionId, { unextractedOnly: true });
    expect(unextracted).toHaveLength(1);
    expect(unextracted[0].content).toBe('pending');
  });

  it('formats conversation with timestamps', () => {
    const messages = [
      { role: 'user', content: 'I prefer dark mode', createdAt: new Date('2026-03-27T10:00:00Z') },
      { role: 'user', content: 'My favorite color is blue', createdAt: new Date('2026-03-27T10:05:00Z') },
    ];

    const formatted = messages.map(m => {
      const time = m.createdAt.toISOString().replace('T', ' ').slice(0, 19);
      return `[${m.role} @ ${time}]: ${m.content}`;
    }).join('\n\n');

    expect(formatted).toContain('[user @ 2026-03-27 10:00:00]: I prefer dark mode');
    expect(formatted).toContain('[user @ 2026-03-27 10:05:00]: My favorite color is blue');
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd packages/mcp-server && pnpm test
```

Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add packages/mcp-server/tests/session-ingestion.test.ts
git commit -m "test: session message storage and conversation formatting"
```

---

### Task 8: Publish and Push

- [ ] **Step 1: Build all packages (must pass before bumping versions)**

```bash
cd packages/engine && pnpm build
cd ../supabase-adapter && pnpm build
cd ../mcp-server && pnpm build
```

- [ ] **Step 2: Bump versions (only after all builds pass)**

```bash
cd packages/engine && npm version patch
cd ../supabase-adapter && npm version patch
cd ../mcp-server && npm version patch
```

- [ ] **Step 3: Rebuild after version bump, then publish**

```bash
cd packages/engine && npm publish --access public
cd ../supabase-adapter && npm publish --access public
cd ../mcp-server && npm publish --access public
```

- [ ] **Step 4: Commit and push**

```bash
cd /Volumes/ExtSSD/WebProjects/steno
git add packages/
git commit -m "feat: session-based ingestion — durable messages, conversation formatting, auto-end"
git push
```

---

### Task 9: End-to-End Test

- [ ] **Step 1: Restart Claude Desktop to pick up new MCP version**

Quit (Cmd+Q) and reopen Claude Desktop.

- [ ] **Step 2: Test steno_remember stores to DB**

Tell Claude Desktop: "remember that I had coffee with Arjun today at Blue Bottle"

Verify in Supabase:
```sql
SELECT id, session_id, role, content, turn_number, extraction_id, created_at
FROM session_messages
ORDER BY created_at DESC
LIMIT 5;
```

- [ ] **Step 3: Test flush extracts with conversation format (KEY TEST — check this first)**

Tell Claude Desktop: "flush"

Verify extraction was created with conversation format:
```sql
SELECT id, input_type, input_data, status
FROM extractions
ORDER BY created_at DESC
LIMIT 1;
```

Expected: `input_type = 'conversation'`, `input_data` contains `[user @ timestamp]: content`. **If this passes, the core change is working.** Everything else flows from this.

- [ ] **Step 4: Test steno_end_session**

Tell Claude Desktop: "end session"

Verify:
```sql
SELECT id, summary, topics, ended_at
FROM sessions
ORDER BY started_at DESC
LIMIT 1;
```

Expected: `ended_at` is set, `summary` contains a description, `topics` is populated.

- [ ] **Step 5: Test recall still works**

Tell Claude Desktop: "what do you know about Arjun?"

Verify the coffee fact from step 2 is returned.

---

## Spec Coverage Checklist

| Requirement | Task |
|------------|------|
| session_messages table | Task 3 (migration) |
| Storage adapter methods | Task 2 (interface) + Task 3 (implementation) |
| steno_remember writes to DB | Task 4 (step 5) |
| Flush reads from DB, formats as conversation | Task 4 (step 3) |
| Mark messages as extracted | Task 4 (step 3, markMessagesExtracted call) |
| Auto-end stale sessions | Task 4 (step 5, staleness check) |
| Configurable timeout | Task 4 (steps 1, 11) |
| steno_end_session tool | Task 4 (step 10) |
| Session summary generation | Task 4 (step 10, calls endSession) |
| SKILL.md + README updates | Task 5 |
| Migration on both Supabase instances | Task 6 |
| Integration tests | Task 7 |
| Navia conversation path unaffected | No change — Navia calls pipeline directly with inputType='conversation' + string data, which hits inputToText line 40 (returns string as-is). MCP changes don't touch pipeline internals. |
| Publish + push | Task 8 |
| End-to-end verification | Task 9 |

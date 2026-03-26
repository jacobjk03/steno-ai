/**
 * Local MCP server — connects directly to Supabase + engine.
 * No API deployment needed. Just set env vars and go.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StorageAdapter } from '../../engine/src/adapters/storage.js';
import type { EmbeddingAdapter } from '../../engine/src/adapters/embedding.js';
import type { LLMAdapter } from '../../engine/src/adapters/llm.js';

export interface LocalServerConfig {
  storage: StorageAdapter;
  embedding: EmbeddingAdapter;
  cheapLLM: LLMAdapter;
  tenantId: string;
  scope: 'user' | 'agent' | 'session' | 'hive';
  scopeId: string;
  embeddingModel: string;
  embeddingDim: number;
}

// ---------------------------------------------------------------------------
// Session buffer types
// ---------------------------------------------------------------------------
interface SessionBuffer {
  sessionId: string;
  messages: string[];
  lastActivity: Date;
  flushTimer: ReturnType<typeof setTimeout> | null;
}

const FLUSH_DELAY_MS = 30_000; // 30 seconds of inactivity triggers flush
const MAX_BUFFER_SIZE = 5;     // flush after 5 messages

export function createLocalServer(config: LocalServerConfig): McpServer {
  const server = new McpServer({
    name: 'steno-local',
    version: '0.1.0',
    instructions: `You have access to the user's persistent long-term memory via Steno.

CRITICAL RULES:
1. ALWAYS call steno_recall BEFORE answering ANY question about the user, their life, work, projects, people they know, preferences, past events, companies, or decisions. Do this BEFORE using web search or "Relevant chats".
2. When the user shares personal information, experiences, opinions, or decisions, call steno_remember to store it.
3. Never say "I don't have information about that" without first checking steno_recall.
4. Steno memory persists across ALL conversations — it knows things from past sessions that your conversation history does not.`,
  });

  // Lazy import to avoid loading heavy modules at startup
  let _search: typeof import('../../engine/src/retrieval/search.js').search | null = null;
  let _pipeline: typeof import('../../engine/src/extraction/pipeline.js').runExtractionPipeline | null = null;
  let _getOrCreateActiveSession: typeof import('../../engine/src/sessions/manager.js').getOrCreateActiveSession | null = null;

  async function getSearch() {
    if (!_search) {
      const mod = await import('../../engine/src/retrieval/search.js');
      _search = mod.search;
    }
    return _search;
  }

  async function getPipeline() {
    if (!_pipeline) {
      const mod = await import('../../engine/src/extraction/pipeline.js');
      _pipeline = mod.runExtractionPipeline;
    }
    return _pipeline;
  }

  async function getSessionManager() {
    if (!_getOrCreateActiveSession) {
      const mod = await import('../../engine/src/sessions/manager.js');
      _getOrCreateActiveSession = mod.getOrCreateActiveSession;
    }
    return _getOrCreateActiveSession;
  }

  // ---------------------------------------------------------------------------
  // Session buffer — accumulate messages, flush periodically
  // ---------------------------------------------------------------------------
  const sessionBuffers = new Map<string, SessionBuffer>();

  /** Build a buffer key from scope parameters */
  function bufferKey(): string {
    return `${config.tenantId}:${config.scope}:${config.scopeId}`;
  }

  /** Flush the session buffer: run extraction pipeline on all accumulated messages */
  async function flushBuffer(key: string): Promise<void> {
    const buf = sessionBuffers.get(key);
    if (!buf || buf.messages.length === 0) return;

    // Grab and clear the buffer immediately so new messages start a fresh batch
    const messages = [...buf.messages];
    const sessionId = buf.sessionId;
    buf.messages = [];
    if (buf.flushTimer) {
      clearTimeout(buf.flushTimer);
      buf.flushTimer = null;
    }

    const fullText = messages.join('\n---\n');

    console.error(`[steno] Flushing session buffer: ${messages.length} messages, sessionId=${sessionId}`);

    try {
      const runPipeline = await getPipeline();
      const result = await runPipeline(
        {
          storage: config.storage,
          embedding: config.embedding,
          cheapLLM: config.cheapLLM,
          embeddingModel: config.embeddingModel,
          embeddingDim: config.embeddingDim,
          extractionTier: 'auto',
        },
        {
          tenantId: config.tenantId,
          scope: config.scope,
          scopeId: config.scopeId,
          sessionId,
          inputType: 'raw_text',
          data: fullText,
        },
      );
      console.error(`[steno] Session flush done: ${result.factsCreated} facts, ${result.entitiesCreated} entities, ${result.edgesCreated} edges`);
    } catch (err: any) {
      console.error('[steno] Session flush pipeline error:', err?.message ?? err);
    }
  }

  /** Schedule a flush after the inactivity delay, or flush immediately if buffer is full */
  function scheduleFlush(key: string): void {
    const buf = sessionBuffers.get(key);
    if (!buf) return;

    // Clear any existing timer
    if (buf.flushTimer) {
      clearTimeout(buf.flushTimer);
      buf.flushTimer = null;
    }

    // Flush immediately if buffer is full
    if (buf.messages.length >= MAX_BUFFER_SIZE) {
      void flushBuffer(key);
      return;
    }

    // Otherwise schedule a delayed flush
    buf.flushTimer = setTimeout(() => {
      void flushBuffer(key);
    }, FLUSH_DELAY_MS);
  }

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

      // ── Session-based buffering ──
      // Accumulate messages within a session. Extraction runs when the buffer
      // is full (MAX_BUFFER_SIZE) or after an inactivity timeout (FLUSH_DELAY_MS).
      const key = bufferKey();
      let buf = sessionBuffers.get(key);

      if (!buf) {
        // Start or resume a session
        let sessionId: string;
        try {
          const getOrCreate = await getSessionManager();
          // SessionScope excludes 'session', but config.scope might be 'session'.
          // Treat 'session' scope as 'user' for session tracking purposes.
          const sessionScope = config.scope === 'session' ? 'user' : config.scope;
          const session = await getOrCreate(config.storage, config.tenantId, sessionScope as any, config.scopeId);
          sessionId = session.id;
        } catch (err: any) {
          console.error('[steno] Failed to create session, using ephemeral ID:', err?.message ?? err);
          sessionId = crypto.randomUUID();
        }

        buf = {
          sessionId,
          messages: [],
          lastActivity: new Date(),
          flushTimer: null,
        };
        sessionBuffers.set(key, buf);
      }

      // Buffer the message
      buf.messages.push(memoryText);
      buf.lastActivity = new Date();

      // FAST PATH: For short, already-clean facts (< 200 chars, single sentence),
      // skip the LLM extraction pipeline and store directly. ~200ms vs ~5000ms.
      // Only use fast path for the first message in a buffer (no session context yet).
      const isSingleFact = memoryText.length < 200 && !memoryText.includes('\n') && memoryText.split('.').length <= 2;

      if (isSingleFact && buf.messages.length === 1) {
        const factId = crypto.randomUUID();
        const embedding = await config.embedding.embed(memoryText);

        // Ensure "User" entity exists and link fact to it
        let userEntityId: string | undefined;
        try {
          const existing = await config.storage.findEntityByCanonicalName(config.tenantId, 'user', 'person');
          if (existing) {
            userEntityId = existing.id;
          } else {
            userEntityId = crypto.randomUUID();
            await config.storage.createEntity({
              id: userEntityId, tenantId: config.tenantId, name: 'User',
              entityType: 'person', canonicalName: 'user', properties: {},
              embedding: await config.embedding.embed('User'),
              embeddingModel: config.embeddingModel, embeddingDim: config.embeddingDim,
            });
          }
        } catch {}

        const linkToUser = async (fid: string) => {
          if (userEntityId) {
            try { await config.storage.linkFactEntity(fid, userEntityId, 'mentioned'); } catch {}
          }
        };

        // Quick dedup check — see if very similar fact exists
        const matches = await config.storage.vectorSearch({
          embedding,
          tenantId: config.tenantId,
          scope: config.scope,
          scopeId: config.scopeId,
          limit: 1,
          minSimilarity: 0.85,
          validOnly: true,
        });

        if (matches.length > 0) {
          // Similar fact exists — create new version (Git-style append-only, never invalidate)
          const oldFact = matches[0].fact;
          await config.storage.createFact({
            id: factId,
            lineageId: oldFact.lineageId ?? crypto.randomUUID(),
            tenantId: config.tenantId,
            scope: config.scope,
            scopeId: config.scopeId,
            sessionId: buf.sessionId,
            content: memoryText,
            embeddingModel: config.embeddingModel,
            embeddingDim: config.embeddingDim,
            embedding,
            importance: 0.7,
            confidence: 1.0,
            operation: 'update',
            sourceType: 'api',
            modality: 'text',
            tags: ['direct'],
            metadata: {},
            contradictionStatus: 'none',
          });
          await linkToUser(factId);
          // Clear the buffer since we already stored this fact directly
          buf.messages = [];
          return {
            content: [{ type: 'text' as const, text: `Remembered (1 fact updated, 0 entities, 0 edges)` }],
          };
        }

        // No similar fact — create new
        await config.storage.createFact({
          id: factId,
          lineageId: crypto.randomUUID(),
          tenantId: config.tenantId,
          scope: config.scope,
          scopeId: config.scopeId,
          sessionId: buf.sessionId,
          content: memoryText,
          embeddingModel: config.embeddingModel,
          embeddingDim: config.embeddingDim,
          embedding,
          importance: 0.7,
          confidence: 1.0,
          operation: 'create',
          sourceType: 'api',
          modality: 'text',
          tags: ['direct'],
          metadata: {},
          contradictionStatus: 'none',
        });
        await linkToUser(factId);
        // Clear the buffer since we already stored this fact directly
        buf.messages = [];
        return {
          content: [{ type: 'text' as const, text: `Remembered (1 fact, 0 entities, 0 edges)` }],
        };
      }

      // BUFFERED PATH: Accumulate and schedule flush.
      // Returns immediately — extraction happens in the background when flushed.
      scheduleFlush(key);

      const pending = buf.messages.length;
      return {
        content: [{ type: 'text' as const, text: `Buffered (${pending}/${MAX_BUFFER_SIZE} messages in session). Extraction runs on flush.` }],
      };
    },
  );

  // ─── FLUSH ───
  server.tool(
    'steno_flush',
    'Force extraction of all buffered session messages. Use before searching if you just stored information and need it immediately available.',
    {},
    async () => {
      const key = bufferKey();
      const buf = sessionBuffers.get(key);
      if (!buf || buf.messages.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No buffered messages to flush.' }] };
      }
      const count = buf.messages.length;
      await flushBuffer(key);
      return {
        content: [{ type: 'text' as const, text: `Flushed ${count} buffered messages. Extraction complete.` }],
      };
    },
  );

  // ─── RECALL ───
  server.tool(
    'steno_recall',
    'ALWAYS search this memory before answering questions about the user, their life, work, projects, preferences, people they know, companies, events, or anything personal. This contains the user\'s persistent memory across all conversations. Search here FIRST before using web search or saying you don\'t know.',
    {
      query: z.string().describe('What to search for in memory'),
      limit: z.number().optional().describe('Max results (default 10)'),
    },
    async ({ query, limit }) => {
      // Auto-flush any pending buffered messages before searching
      const key = bufferKey();
      const buf = sessionBuffers.get(key);
      if (buf && buf.messages.length > 0) {
        await flushBuffer(key);
      }

      const searchFn = await getSearch();
      const results = await searchFn(
        { storage: config.storage, embedding: config.embedding },
        {
          query,
          tenantId: config.tenantId,
          scope: config.scope,
          scopeId: config.scopeId,
          limit: limit ?? 10,
        },
      );

      if (results.results.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No memories found.' }] };
      }

      const text = results.results
        .map((r) => {
          const dateParts: string[] = [];
          if (r.fact.eventDate) dateParts.push(`event: ${new Date(r.fact.eventDate).toISOString().slice(0, 10)}`);
          if (r.fact.documentDate) dateParts.push(`doc: ${new Date(r.fact.documentDate).toISOString().slice(0, 10)}`);
          const dateStr = dateParts.length > 0 ? `, ${dateParts.join(', ')}` : '';
          const signals = Object.entries(r.signals)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => `${k.replace('Score', '')}=${(v as number).toFixed(2)}`)
            .join(', ');
          let line = `[Memory] ${r.fact.content} (score: ${r.score.toFixed(2)}${dateStr}${signals ? `, ${signals}` : ''})`;
          if (r.fact.sourceChunk) {
            line += `\n[Source Context] ${r.fact.sourceChunk}`;
          }
          line += '\n---';
          return line;
        })
        .join('\n');

      return {
        content: [
          {
            type: 'text' as const,
            text: `Found ${results.results.length} memories (${results.durationMs}ms):\n\n${text}`,
          },
        ],
      };
    },
  );

  // ─── FEEDBACK ───
  server.tool(
    'steno_feedback',
    'Rate whether a recalled memory was useful. Helps improve future recall quality.',
    {
      fact_id: z.string().describe('Memory/fact ID to rate'),
      useful: z.boolean().describe('Was this memory useful?'),
    },
    async ({ fact_id, useful }) => {
      await config.storage.createMemoryAccess({
        tenantId: config.tenantId,
        factId: fact_id,
        query: '',
        searchRank: 0,
        feedbackType: useful ? 'explicit_positive' : 'explicit_negative',
        responseTimeMs: 0,
      });
      return {
        content: [
          { type: 'text' as const, text: `Feedback recorded: ${useful ? 'positive' : 'negative'}` },
        ],
      };
    },
  );

  // ─── STATS ───
  server.tool(
    'steno_stats',
    'Get memory statistics — how many facts, entities, and edges are stored.',
    {},
    async () => {
      const facts = await config.storage.getFactsByScope(
        config.tenantId, config.scope, config.scopeId, { limit: 1 },
      );
      const entities = await config.storage.getEntitiesForTenant(config.tenantId, { limit: 1 });

      return {
        content: [
          {
            type: 'text' as const,
            text: `Memory stats:\n  Facts: ${facts.hasMore ? '100+' : facts.data.length}\n  Entities: ${entities.hasMore ? '100+' : entities.data.length}`,
          },
        ],
      };
    },
  );

  return server;
}

/**
 * Local MCP server — connects directly to Supabase + engine.
 * No API deployment needed. Just set env vars and go.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StorageAdapter, EmbeddingAdapter, LLMAdapter } from '@steno-ai/engine';

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

// In-memory embedding cache — survives across tool calls within the same MCP session
let _embeddingCache: Map<string, { embedding: number[]; ts: number }> | null = null;
function getEmbeddingCache() {
  if (!_embeddingCache) _embeddingCache = new Map();
  return _embeddingCache;
}

/** Simple cache adapter that wraps a Map for embedding caching */
const embeddingCacheAdapter = {
  async get<T>(key: string): Promise<T | null> {
    const cache = getEmbeddingCache();
    const entry = cache.get(key);
    if (!entry) return null;
    // TTL: 10 minutes
    if (Date.now() - entry.ts > 600_000) {
      cache.delete(key);
      return null;
    }
    return entry.embedding as unknown as T;
  },
  async set<T>(key: string, value: T): Promise<void> {
    const cache = getEmbeddingCache();
    cache.set(key, { embedding: value as unknown as number[], ts: Date.now() });
    // Evict old entries if cache grows too large (>500 entries)
    if (cache.size > 500) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, 100);
      for (const [k] of oldest) cache.delete(k);
    }
  },
  async del(key: string): Promise<void> { getEmbeddingCache().delete(key); },
  async incr(): Promise<number> { return 0; },
  async expire(): Promise<void> {},
  async ping(): Promise<boolean> { return true; },
};

export function createLocalServer(config: LocalServerConfig): McpServer {
  const server = new McpServer({
    name: 'steno-local',
    version: '0.1.0',
  });

  // Lazy import to avoid loading heavy modules at startup
  let _search: typeof import('@steno-ai/engine').search | null = null;
  let _pipeline: typeof import('@steno-ai/engine').runExtractionPipeline | null = null;
  let _getOrCreateActiveSession: typeof import('@steno-ai/engine').getOrCreateActiveSession | null = null;

  async function getSearch() {
    if (!_search) {
      const mod = await import('@steno-ai/engine');
      _search = mod.search;
    }
    return _search;
  }

  async function getPipeline() {
    if (!_pipeline) {
      const mod = await import('@steno-ai/engine');
      _pipeline = mod.runExtractionPipeline;
    }
    return _pipeline;
  }

  async function getSessionManager() {
    if (!_getOrCreateActiveSession) {
      const mod = await import('@steno-ai/engine');
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
          domainEntityTypes: config.domainEntityTypes,
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

      // ALL messages go through the full pipeline via session buffer (no fast path).
      // Full pipeline gives us: LLM extraction, entity/edge creation,
      // contextual embeddings, temporal grounding, dedup — everything.
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
        { storage: config.storage, embedding: config.embedding, cache: embeddingCacheAdapter as any },
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

      // Build dependency map from edges (ONE query, not per-fact)
      const factIds = results.results.map(r => r.fact.id);
      const depMap = new Map<string, { blocks: string[]; blockedBy: string[]; deadlines: string[] }>();

      try {
        // Query ALL dependency edges for the steno entity (they reference fact IDs in metadata)
        const stenoEntities = await config.storage.getEntitiesForTenant(config.tenantId, { limit: 5 });
        for (const entity of stenoEntities.data) {
          const edges = await config.storage.getEdgesForEntity(config.tenantId, entity.id);
          for (const edge of edges) {
            if (!['precedes', 'depends_on', 'deadline'].includes(edge.relation)) continue;
            const edgeMeta = edge.metadata as Record<string, unknown> | undefined;
            const sourceFactId = edgeMeta?.sourceFactId as string | undefined;
            const targetFactId = edgeMeta?.targetFactId as string | undefined;

            if (edge.relation === 'precedes' && sourceFactId && targetFactId) {
              if (!depMap.has(sourceFactId)) depMap.set(sourceFactId, { blocks: [], blockedBy: [], deadlines: [] });
              // Find target fact content
              const target = results.results.find(x => x.fact.id === targetFactId);
              if (target) depMap.get(sourceFactId)!.blocks.push(target.fact.content.slice(0, 60));
            }
            if (edge.relation === 'depends_on' && sourceFactId && targetFactId) {
              if (!depMap.has(sourceFactId)) depMap.set(sourceFactId, { blocks: [], blockedBy: [], deadlines: [] });
              const dep = results.results.find(x => x.fact.id === targetFactId);
              if (dep) depMap.get(sourceFactId)!.blockedBy.push(dep.fact.content.slice(0, 60));
            }
            if (edge.relation === 'deadline' && edge.factId) {
              if (!depMap.has(edge.factId)) depMap.set(edge.factId, { blocks: [], blockedBy: [], deadlines: [] });
              const deadline = edgeMeta?.deadline as string | undefined;
              if (deadline) depMap.get(edge.factId)!.deadlines.push(deadline);
            }
          }
        }
      } catch { /* edge lookup failed */ }

      const enrichedLines: string[] = [];
      for (const r of results.results) {
        const meta = r.fact.metadata as Record<string, unknown> | undefined;
        const status = meta?.status as string | undefined;
        const priorityOrder = meta?.priority_order as number | undefined;
        const deps = depMap.get(r.fact.id);

        const dateParts: string[] = [];
        if (r.fact.eventDate) dateParts.push(`event: ${new Date(r.fact.eventDate).toISOString().slice(0, 10)}`);
        if (r.fact.documentDate) dateParts.push(`doc: ${new Date(r.fact.documentDate).toISOString().slice(0, 10)}`);
        const dateStr = dateParts.length > 0 ? `, ${dateParts.join(', ')}` : '';
        const signals = Object.entries(r.signals)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `${k.replace('Score', '')}=${(v as number).toFixed(2)}`)
          .join(', ');

        // Format with dependency context
        const isPriority = status || priorityOrder;
        const blocks = deps?.blocks ?? [];
        const blockedBy = deps?.blockedBy ?? [];
        const deadlines = deps?.deadlines ?? [];
        let line: string;
        if (isPriority) {
          line = `[Priority${priorityOrder ? ` #${priorityOrder}` : ''}] ${r.fact.content}`;
          line += `\n  status: ${status || 'unknown'}`;
          if (blocks.length > 0) line += `\n  blocks: → ${blocks.join(', ')}`;
          if (blockedBy.length > 0) line += `\n  blocked_by: ← ${blockedBy.join(', ')}`;
          else if (status === 'not_started') line += `\n  blocked_by: none`;
          if (deadlines.length > 0) line += `\n  deadline: ${deadlines.join(', ')}`;
          line += `\n  (score: ${r.score.toFixed(2)}${dateStr})`;
        } else {
          line = `[Memory] ${r.fact.content} (score: ${r.score.toFixed(2)}${dateStr}${signals ? `, ${signals}` : ''})`;
        }
        if (r.fact.sourceChunk && !isPriority) {
          line += `\n[Source Context] ${r.fact.sourceChunk}`;
        }
        line += '\n---';
        enrichedLines.push(line);
      }

      const text = enrichedLines.join('\n');

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
        retrievalMethod: 'feedback',
        rankPosition: 0,
        responseTimeMs: 0,
      } as any);
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

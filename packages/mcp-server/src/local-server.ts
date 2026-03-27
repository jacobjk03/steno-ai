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
    instructions: `You have access to the user's persistent long-term memory via Steno.

CRITICAL RULES:
1. ALWAYS call steno_recall BEFORE answering ANY question about the user, their life, work, projects, people they know, preferences, past events, companies, or decisions.
2. When the user shares personal information, call steno_remember to store it, then ALWAYS call steno_flush immediately after to ensure extraction happens now.
3. Before context compaction or session end, call steno_remember with a summary of key decisions and progress, then steno_flush.
4. Never say "I don't have information about that" without first checking steno_recall.
5. Steno memory persists across ALL conversations — it knows things from past sessions that your conversation history does not.`,
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

      // Build priority label map: factId → "Priority #N (short name)"
      // Query ALL facts with priority_order metadata — not just the ones in results
      // This ensures labels resolve even for facts referenced by edges but not in recall
      const priorityLabels = new Map<string, string>();
      try {
        const { data: allPriorityFacts } = await (config.storage as any).client
          .from('facts')
          .select('id, content, metadata')
          .eq('tenant_id', config.tenantId)
          .not('metadata->priority_order', 'is', null);
        if (allPriorityFacts) {
          for (const f of allPriorityFacts) {
            const order = f.metadata?.priority_order;
            if (order) {
              const shortName = f.content.replace(/^User('s)?\s+(plans|added|believes|is planning|wants|Steno)\s+/i, '').slice(0, 35).replace(/\s+\S*$/, '');
              priorityLabels.set(f.id, `Priority #${order} (${shortName})`);
            }
          }
        }
      } catch { /* fallback to results-only labels */ }
      // Also add labels from results (in case metadata query missed any)
      for (const r of results.results) {
        if (priorityLabels.has(r.fact.id)) continue;
        const meta = r.fact.metadata as Record<string, unknown> | undefined;
        const order = meta?.priority_order as number | undefined;
        if (order) {
          const shortName = r.fact.content.replace(/^User('s)?\s+(plans|added|believes|is planning|wants)\s+/i, '').slice(0, 35).replace(/\s+\S*$/, '');
          priorityLabels.set(r.fact.id, `Priority #${order} (${shortName})`);
        }
      }

      // Build dependency map — ONE batch query for ALL dependency edges in this tenant
      const factIds = results.results.map(r => r.fact.id);
      const depMap = new Map<string, { blocks: string[]; blockedBy: string[]; deadlines: string[] }>();

      try {
        // Query ALL precedes/depends_on/deadline edges — not just for these fact_ids
        // because edges reference sourceFactId/targetFactId in metadata, not in fact_id column
        const { data: depEdges } = await (config.storage as any).client
          .from('edges')
          .select('relation, fact_id, metadata')
          .eq('tenant_id', config.tenantId)
          .in('relation', ['precedes', 'depends_on', 'deadline']);

        if (depEdges) {
          for (const edge of depEdges) {
            const edgeMeta = edge.metadata as Record<string, unknown> | undefined;
            const sourceFactId = (edgeMeta?.sourceFactId as string) || edge.fact_id;
            const targetFactId = edgeMeta?.targetFactId as string | undefined;

            // Only process edges involving facts in our result set
            const sourceInResults = factIds.includes(sourceFactId);
            const targetInResults = targetFactId ? factIds.includes(targetFactId) : false;
            if (!sourceInResults && !targetInResults) continue;

            if (!depMap.has(sourceFactId)) depMap.set(sourceFactId, { blocks: [], blockedBy: [], deadlines: [] });

            if (edge.relation === 'precedes' && targetFactId) {
              const label = priorityLabels.get(targetFactId) || 'another priority';
              depMap.get(sourceFactId)!.blocks.push(label);
            }
            if (edge.relation === 'depends_on' && targetFactId) {
              const label = priorityLabels.get(targetFactId) || 'another priority';
              depMap.get(sourceFactId)!.blockedBy.push(label);
            }
            if (edge.relation === 'deadline') {
              const deadline = edgeMeta?.deadline as string | undefined;
              if (deadline) {
                depMap.get(sourceFactId)!.deadlines.push(deadline);
                // Cascade deadline upstream: if X blocks Y and Y has deadline, X gets it too
                for (const [fid, deps2] of depMap) {
                  if (deps2.blocks.some(b => b.includes(sourceFactId.slice(0, 8)) || priorityLabels.get(sourceFactId)?.includes(b.split('(')[1]?.slice(0, 10) || ''))) {
                    if (!deps2.deadlines.includes(deadline)) deps2.deadlines.push(deadline + ' (cascaded)');
                  }
                }
              }
            }
          }

          // Second pass: cascade deadlines through depends_on chain
          // If A depends_on B, and B has a deadline, A implicitly has that deadline
          for (const [factId, deps] of depMap) {
            if (deps.deadlines.length === 0) {
              // Check if anything this blocks has a deadline
              for (const blockLabel of deps.blocks) {
                for (const [otherId, otherDeps] of depMap) {
                  if (priorityLabels.get(otherId) === blockLabel && otherDeps.deadlines.length > 0) {
                    for (const dl of otherDeps.deadlines) {
                      if (!dl.includes('cascaded') && !deps.deadlines.includes(dl)) {
                        deps.deadlines.push(dl + ' (implicit — blocks deadline item)');
                      }
                    }
                  }
                }
              }
            }
          }
        }
      } catch { /* batch edge lookup failed */ }

      // Inject missing priority facts that are referenced by edges but not in recall results
      // This ensures Priority #1 (root node) always shows up when its children are recalled
      const resultFactIds = new Set(results.results.map(r => r.fact.id));
      try {
        const { data: allPriorities } = await (config.storage as any).client
          .from('facts')
          .select('*')
          .eq('tenant_id', config.tenantId)
          .not('metadata->priority_order', 'is', null);
        if (allPriorities) {
          for (const pf of allPriorities) {
            if (!resultFactIds.has(pf.id) && (depMap.has(pf.id) || priorityLabels.has(pf.id))) {
              // This priority is referenced but not in results — inject it
              const camelFact = Object.fromEntries(
                Object.entries(pf).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), v])
              );
              results.results.push({
                fact: camelFact as any,
                score: 0.1, // Low score since it wasn't directly matched
                signals: { vectorScore: 0, keywordScore: 0, graphScore: 0.5, recencyScore: 0, salienceScore: 0, temporalScore: 0 },
              });
            }
          }
        }
      } catch { /* injection failed */ }

      // Sort results: priorities first (by priority_order), then regular memories
      const sortedResults = [...results.results].sort((a, b) => {
        const aOrder = (a.fact.metadata as any)?.priority_order as number | undefined;
        const bOrder = (b.fact.metadata as any)?.priority_order as number | undefined;
        if (aOrder && bOrder) return aOrder - bOrder;
        if (aOrder) return -1;
        if (bOrder) return 1;
        return b.score - a.score;
      });

      const enrichedLines: string[] = [];
      for (const r of sortedResults) {
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

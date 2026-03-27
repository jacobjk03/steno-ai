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
  sessionTimeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Session buffer types
// ---------------------------------------------------------------------------
interface ActiveSession {
  sessionId: string;
  pendingCount: number;
  flushTimer: ReturnType<typeof setTimeout> | null;
}

const FLUSH_DELAY_MS = 30_000; // 30 seconds of inactivity triggers flush
const MAX_BUFFER_SIZE = 5;     // flush after 5 messages
const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

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
    ...({ instructions: `You have access to the user's persistent long-term memory via Steno.

CRITICAL RULES:
1. ALWAYS call steno_recall BEFORE answering ANY question about the user, their life, work, projects, people they know, preferences, past events, companies, or decisions.
2. When the user shares personal information, call steno_remember to store it, then ALWAYS call steno_flush immediately after to ensure extraction happens now.
3. Before context compaction or session end, call steno_remember with a summary of key decisions and progress, then steno_flush.
4. Never say "I don't have information about that" without first checking steno_recall.
5. Steno memory persists across ALL conversations — it knows things from past sessions that your conversation history does not.
6. Use steno_update_status to change priority/roadmap item status when the user starts, completes, or gets blocked on a task.` } as any),
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

  let _endSession: typeof import('@steno-ai/engine').endSession | null = null;

  async function getEndSession() {
    if (!_endSession) {
      const mod = await import('@steno-ai/engine');
      _endSession = mod.endSession;
    }
    return _endSession;
  }

  // ---------------------------------------------------------------------------
  // Active sessions — track pending message counts, flush periodically
  // ---------------------------------------------------------------------------
  const activeSessions = new Map<string, ActiveSession>();

  /** Build a buffer key from scope parameters */
  function bufferKey(): string {
    return `${config.tenantId}:${config.scope}:${config.scopeId}`;
  }

  /** Flush the session: read unextracted messages from DB, run extraction pipeline */
  async function flushSession(key: string): Promise<void> {
    const active = activeSessions.get(key);
    if (!active) return;

    if (active.flushTimer) {
      clearTimeout(active.flushTimer);
      active.flushTimer = null;
    }

    try {
      const messages = await config.storage.getSessionMessages(
        config.tenantId, active.sessionId, { unextractedOnly: true },
      );
      if (messages.length === 0) {
        active.pendingCount = 0;
        return;
      }

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

  /** Schedule a flush after the inactivity delay, or flush immediately if buffer is full */
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
          if (messages.length > 0) {
            const lastMsg = messages[messages.length - 1]!;
            if (Date.now() - lastMsg.createdAt.getTime() > sessionTimeout) {
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
          }
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
        return { content: [{ type: 'text' as const, text: `Error storing message: ${err?.message}` }] };
      }

      scheduleFlush(key);

      return {
        content: [{
          type: 'text' as const,
          text: `Stored in session ${active.sessionId.slice(0, 8)} (${active.pendingCount}/${MAX_BUFFER_SIZE} pending). Extraction runs on flush.`,
        }],
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

      if (active.pendingCount > 0) {
        await flushSession(key);
      }

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

  // ─── RECALL ───
  server.tool(
    'steno_recall',
    'ALWAYS search this memory before answering questions about the user, their life, work, projects, preferences, people they know, companies, events, or anything personal. This contains the user\'s persistent memory across all conversations. Search here FIRST before using web search or saying you don\'t know.',
    {
      query: z.string().describe('What to search for in memory'),
      limit: z.number().optional().describe('Max results (default 10)'),
      max_tokens: z.number().optional().describe('Approximate token budget for the response. Results will be truncated from lowest-scored to fit.'),
    },
    async ({ query, limit, max_tokens }) => {
      // Auto-flush any pending buffered messages before searching
      const key = bufferKey();
      const active = activeSessions.get(key);
      if (active && active.pendingCount > 0) {
        await flushSession(key);
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
      // Include ALL priority fact IDs so edges for injected priorities aren't skipped
      const factIdSet = new Set(results.results.map(r => r.fact.id));
      for (const [factId] of priorityLabels) factIdSet.add(factId);

      const depMap = new Map<string, { blocks: string[]; blockedBy: string[]; deadlines: string[] }>();
      function ensureDepEntry(id: string) {
        if (!depMap.has(id)) depMap.set(id, { blocks: [], blockedBy: [], deadlines: [] });
        return depMap.get(id)!;
      }

      try {
        const { data: depEdges } = await (config.storage as any).client
          .from('edges')
          .select('relation, fact_id, metadata')
          .eq('tenant_id', config.tenantId)
          .in('relation', ['precedes', 'depends_on', 'deadline']);

        if (depEdges) {
          // Build a reverse lookup: factId → Set of factIds it blocks (from precedes edges)
          const blocksLookup = new Map<string, Set<string>>();

          for (const edge of depEdges) {
            const edgeMeta = edge.metadata as Record<string, unknown> | undefined;
            const sourceFactId = (edgeMeta?.sourceFactId as string) || edge.fact_id;
            const targetFactId = edgeMeta?.targetFactId as string | undefined;

            // Only process edges involving facts in our result set OR priority facts
            if (!factIdSet.has(sourceFactId) && !(targetFactId && factIdSet.has(targetFactId))) continue;

            if (edge.relation === 'precedes' && targetFactId) {
              // Source blocks target — index BOTH directions
              const sourceLabel = priorityLabels.get(targetFactId) || 'another priority';
              ensureDepEntry(sourceFactId).blocks.push(sourceLabel);
              const targetLabel = priorityLabels.get(sourceFactId) || 'another priority';
              ensureDepEntry(targetFactId).blockedBy.push(targetLabel);
              // Track for deadline cascade
              if (!blocksLookup.has(sourceFactId)) blocksLookup.set(sourceFactId, new Set());
              blocksLookup.get(sourceFactId)!.add(targetFactId);
            }
            if (edge.relation === 'depends_on' && targetFactId) {
              const label = priorityLabels.get(targetFactId) || 'another priority';
              ensureDepEntry(sourceFactId).blockedBy.push(label);
              // Reverse: target blocks source
              const reverseLabel = priorityLabels.get(sourceFactId) || 'another priority';
              ensureDepEntry(targetFactId).blocks.push(reverseLabel);
            }
            if (edge.relation === 'deadline') {
              const deadline = edgeMeta?.deadline as string | undefined;
              if (deadline) {
                ensureDepEntry(sourceFactId).deadlines.push(deadline);
              }
            }
          }

          // Deduplicate blocks/blockedBy (precedes + depends_on can create duplicates)
          for (const [, deps] of depMap) {
            deps.blocks = [...new Set(deps.blocks)];
            deps.blockedBy = [...new Set(deps.blockedBy)];
          }

          // Cascade deadlines: if A blocks B and B has a deadline, A gets it too
          for (const [factId, targets] of blocksLookup) {
            const sourceDeps = depMap.get(factId);
            if (!sourceDeps || sourceDeps.deadlines.length > 0) continue;
            for (const targetId of targets) {
              const targetDeps = depMap.get(targetId);
              if (targetDeps) {
                for (const dl of targetDeps.deadlines) {
                  if (!dl.includes('cascaded') && !sourceDeps.deadlines.includes(dl)) {
                    sourceDeps.deadlines.push(dl + ' (cascaded)');
                  }
                }
              }
            }
          }

          // Second pass: cascade through depends_on — if A depends_on B and A has deadline, B inherits
          for (const [factId, deps] of depMap) {
            if (deps.deadlines.length > 0) continue;
            for (const blockLabel of deps.blocks) {
              for (const [otherId, otherDeps] of depMap) {
                if (priorityLabels.get(otherId) === blockLabel && otherDeps.deadlines.length > 0) {
                  for (const dl of otherDeps.deadlines) {
                    if (!dl.includes('cascaded') && !dl.includes('implicit') && !deps.deadlines.includes(dl)) {
                      deps.deadlines.push(dl + ' (implicit — blocks deadline item)');
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

        // Skip dismissed facts
        if (meta?.dismissed === true) continue;

        const status = meta?.status as string | undefined;
        const priorityOrder = meta?.priority_order as number | undefined;
        const confidence = meta?.confidence as number | undefined;
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
          line += `\n  status: ${status || 'unknown'}${confidence !== undefined ? ` (confidence: ${confidence})` : ''}`;
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

      // Token budget truncation: drop lowest-scored results to fit
      let finalLines = enrichedLines;
      let truncatedCount = 0;
      if (max_tokens && max_tokens > 0) {
        const budgetLines: string[] = [];
        let tokenEstimate = 0;
        for (const line of enrichedLines) {
          const lineTokens = Math.ceil(line.length / 4);
          if (tokenEstimate + lineTokens > max_tokens && budgetLines.length > 0) {
            truncatedCount = enrichedLines.length - budgetLines.length;
            break;
          }
          budgetLines.push(line);
          tokenEstimate += lineTokens;
        }
        finalLines = budgetLines;
      }

      const text = finalLines.join('\n');
      const truncNote = truncatedCount > 0 ? `\n\n(${truncatedCount} more results truncated to fit token budget)` : '';

      return {
        content: [
          {
            type: 'text' as const,
            text: `Found ${results.results.length} memories (${results.durationMs}ms):\n\n${text}${truncNote}`,
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

  // ─── UPDATE STATUS ───
  server.tool(
    'steno_update_status',
    'Update the status of a priority/roadmap item. Use when a task changes state (e.g., started working on it, completed it, or it became blocked).',
    {
      priority: z.number().describe('Priority number (1-6)'),
      status: z.enum(['not_started', 'in_progress', 'done', 'blocked']).describe('New status'),
      confidence: z.number().min(0).max(1).optional().describe('Confidence level (0.0-1.0) that this status is accurate'),
    },
    async ({ priority, status, confidence }) => {
      try {
        // Find the fact with this priority_order
        const { data: facts, error: findError } = await (config.storage as any).client
          .from('facts')
          .select('id, content, metadata')
          .eq('tenant_id', config.tenantId)
          .not('metadata->priority_order', 'is', null);

        if (findError) throw findError;

        const fact = facts?.find((f: any) => f.metadata?.priority_order === priority);
        if (!fact) {
          return { content: [{ type: 'text' as const, text: `No priority #${priority} found.` }] };
        }

        const oldStatus = fact.metadata?.status || 'unknown';
        const newMetadata = { ...fact.metadata, status, ...(confidence !== undefined && { confidence }) };

        const { error: updateError } = await (config.storage as any).client
          .from('facts')
          .update({ metadata: newMetadata })
          .eq('id', fact.id)
          .eq('tenant_id', config.tenantId);

        if (updateError) throw updateError;

        const shortName = fact.content.replace(/^User('s)?\s+(plans|added|believes|is planning|wants|Steno)\s+/i, '').slice(0, 50);
        return {
          content: [{
            type: 'text' as const,
            text: `Priority #${priority} (${shortName}): ${oldStatus} → ${status}${confidence !== undefined ? ` (confidence: ${confidence})` : ''}`,
          }],
        };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error updating status: ${err?.message ?? err}` }] };
      }
    },
  );

  // ─── DISMISS ───
  server.tool(
    'steno_dismiss',
    'Mark a memory/fact as dismissed without deleting it. Dismissed facts are hidden from future recall results. Use when a fact is outdated, irrelevant, or no longer useful.',
    {
      fact_id: z.string().describe('The fact ID to dismiss'),
    },
    async ({ fact_id }) => {
      try {
        const { data: fact, error: findError } = await (config.storage as any).client
          .from('facts')
          .select('id, content, metadata')
          .eq('id', fact_id)
          .eq('tenant_id', config.tenantId)
          .maybeSingle();

        if (findError) throw findError;
        if (!fact) {
          return { content: [{ type: 'text' as const, text: `Fact ${fact_id} not found.` }] };
        }

        const newMetadata = { ...fact.metadata, dismissed: true, dismissedAt: new Date().toISOString() };

        const { error: updateError } = await (config.storage as any).client
          .from('facts')
          .update({ metadata: newMetadata })
          .eq('id', fact_id)
          .eq('tenant_id', config.tenantId);

        if (updateError) throw updateError;

        const preview = fact.content.slice(0, 60);
        return {
          content: [{ type: 'text' as const, text: `Dismissed: "${preview}..."` }],
        };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error dismissing fact: ${err?.message ?? err}` }] };
      }
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

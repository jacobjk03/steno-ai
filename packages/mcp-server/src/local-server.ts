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

export function createLocalServer(config: LocalServerConfig): McpServer {
  const server = new McpServer({
    name: 'steno-local',
    version: '0.1.0',
  });

  // Lazy import to avoid loading heavy modules at startup
  let _search: typeof import('../../engine/src/retrieval/search.js').search | null = null;
  let _pipeline: typeof import('../../engine/src/extraction/pipeline.js').runExtractionPipeline | null = null;

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

  // ─── REMEMBER ───
  server.tool(
    'steno_remember',
    'Store information in long-term memory. Use this to remember facts, preferences, decisions, or anything worth recalling later.',
    {
      content: z.string().optional().describe('What to remember'),
      text: z.string().optional().describe('What to remember (alias for content)'),
    },
    async (args) => {
      const memoryText = args.content || args.text;
      if (!memoryText) {
        return { content: [{ type: 'text' as const, text: 'Error: provide content or text' }] };
      }

      // FAST PATH: For short, already-clean facts (< 200 chars, single sentence),
      // skip the LLM extraction pipeline and store directly. ~200ms vs ~5000ms.
      const isSingleFact = memoryText.length < 200 && !memoryText.includes('\n') && memoryText.split('.').length <= 2;

      if (isSingleFact) {
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
          return {
            content: [{ type: 'text' as const, text: `Updated memory (new version created)` }],
          };
        }

        // No similar fact — create new
        await config.storage.createFact({
          id: factId,
          lineageId: crypto.randomUUID(),
          tenantId: config.tenantId,
          scope: config.scope,
          scopeId: config.scopeId,
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
        return {
          content: [{ type: 'text' as const, text: `Remembered` }],
        };
      }

      // FULL PATH: For longer text, multi-sentence content, conversations.
      // Runs LLM extraction + graph building + dedup. ~3-8 seconds.
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
          inputType: 'raw_text',
          data: memoryText,
        },
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: `Remembered (${result.factsCreated} facts, ${result.entitiesCreated} entities, ${result.edgesCreated} edges)`,
          },
        ],
      };
    },
  );

  // ─── RECALL ───
  server.tool(
    'steno_recall',
    'Search long-term memory for relevant information. Use this when you need context about the user, their preferences, past decisions, or any previously stored knowledge.',
    {
      query: z.string().describe('What to search for in memory'),
      limit: z.number().optional().describe('Max results (default 10)'),
    },
    async ({ query, limit }) => {
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
        .map((r, i) => {
          const signals = Object.entries(r.signals)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => `${k.replace('Score', '')}=${(v as number).toFixed(2)}`)
            .join(', ');
          return `${i + 1}. [${r.score.toFixed(2)}] ${r.fact.content}${signals ? `  (${signals})` : ''}`;
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
      const entities = await config.storage.getEntitiesForTenant(config.tenantId);

      return {
        content: [
          {
            type: 'text' as const,
            text: `Memory stats:\n  Facts: ${facts.hasMore ? '100+' : facts.data.length}\n  Entities: ${entities.length}`,
          },
        ],
      };
    },
  );

  return server;
}

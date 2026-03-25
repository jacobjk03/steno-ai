import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Steno from '@steno-ai/sdk';
import { z } from 'zod';

// TODO: Remove these helper types once the SDK exports profile/graph types
interface ProfileFact {
  category?: string;
  content: string;
}
interface ProfileResponse {
  static?: ProfileFact[];
  dynamic?: ProfileFact[];
}
interface GraphEntity {
  name: string;
  entityType: string;
}
interface GraphEdge {
  relation: string;
}
interface GraphResponse {
  entities?: GraphEntity[];
  edges?: GraphEdge[];
}

export function createServer(steno: Steno): McpServer {
  const server = new McpServer({
    name: 'steno',
    version: '0.1.0',
  });

  server.tool(
    'steno_remember',
    'Remember information about a user or topic for future reference',
    {
      user_id: z.string().describe('User identifier'),
      content: z.string().describe('What to remember'),
    },
    async ({ user_id, content }) => {
      const result = await steno.add(user_id, content);
      return {
        content: [
          { type: 'text' as const, text: `Remembered. Extraction ID: ${result.extractionId}` },
        ],
      };
    },
  );

  server.tool(
    'steno_recall',
    'Recall relevant memories about a user or topic',
    {
      user_id: z.string().describe('User identifier'),
      query: z.string().describe('What to recall'),
      limit: z.number().optional().describe('Max results (default 5)'),
    },
    async ({ user_id, query, limit }) => {
      const results = await steno.search(user_id, query, limit ?? 5);
      const text =
        results.results.length > 0
          ? results.results
              .map((r, i) => `${i + 1}. [${r.score.toFixed(2)}] ${r.content} (id: ${r.id})`)
              .join('\n')
          : 'No memories found.';
      return {
        content: [{ type: 'text' as const, text }],
      };
    },
  );

  server.tool(
    'steno_feedback',
    'Rate whether a recalled memory was useful',
    {
      fact_id: z.string().describe('Memory ID to rate'),
      useful: z.boolean().describe('Was this memory useful?'),
    },
    async ({ fact_id, useful }) => {
      await steno.feedback(fact_id, useful);
      return {
        content: [
          { type: 'text' as const, text: `Feedback recorded: ${useful ? 'positive' : 'negative'}` },
        ],
      };
    },
  );

  // TODO: Replace raw HTTP calls with steno.profile() / steno.graph.getRelated()
  // once the SDK is updated with profile and graph support.

  server.tool(
    'steno_profile',
    'Get a structured profile of everything known about a user',
    {
      user_id: z.string().describe('User identifier'),
    },
    async ({ user_id }) => {
      // TODO: Replace with `await steno.profile(user_id)` once SDK supports it
      const profile = await (steno as any).memory.http.request(
        'GET',
        `/v1/profile/${encodeURIComponent(user_id)}`,
      ) as ProfileResponse;
      let text = `Profile for ${user_id}:\n\nStatic facts:\n`;
      text +=
        (profile.static || []).map((f: ProfileFact) => `  - [${f.category}] ${f.content}`).join('\n') ||
        '  (none)';
      text += '\n\nDynamic facts:\n';
      text += (profile.dynamic || []).map((f: ProfileFact) => `  - ${f.content}`).join('\n') || '  (none)';
      return {
        content: [{ type: 'text' as const, text }],
      };
    },
  );

  server.tool(
    'steno_graph',
    'Explore entity relationships in the knowledge graph',
    {
      entity_id: z.string().describe('Entity ID to explore'),
      depth: z.number().optional().describe('Graph traversal depth (default 2)'),
    },
    async ({ entity_id, depth }) => {
      // TODO: Replace with `await steno.graph.getRelated(entity_id, depth ?? 2)` once SDK supports it
      const result = await (steno as any).memory.http.request(
        'GET',
        `/v1/graph/${encodeURIComponent(entity_id)}?depth=${depth ?? 2}`,
      ) as GraphResponse;
      const entities = result.entities || [];
      const edges = result.edges || [];
      let text = `Graph for entity ${entity_id}:\n`;
      text += `Entities: ${entities.length}\n`;
      text += entities.map((e: GraphEntity) => `  - ${e.name} (${e.entityType})`).join('\n');
      text += `\nRelationships: ${edges.length}\n`;
      text += edges.map((e: GraphEdge) => `  - ${e.relation}`).join('\n');
      return {
        content: [{ type: 'text' as const, text }],
      };
    },
  );

  return server;
}

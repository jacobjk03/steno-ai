import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Steno from '@steno-ai/sdk';
import { z } from 'zod';

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

  return server;
}

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type Steno from '@steno-ai/sdk';
import { createServer } from '../src/server.js';

function createMockSteno(): Steno {
  return {
    add: vi.fn().mockResolvedValue({ extractionId: 'ext_123' }),
    search: vi.fn().mockResolvedValue({
      results: [
        {
          id: 'fact_1',
          content: 'User loves pizza',
          score: 0.95,
          scope: 'user',
          scopeId: 'user_1',
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
        {
          id: 'fact_2',
          content: 'User works at Google',
          score: 0.87,
          scope: 'user',
          scopeId: 'user_1',
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
      ],
      query: 'food',
    }),
    feedback: vi.fn().mockResolvedValue(undefined),
  } as unknown as Steno;
}

describe('MCP Server', () => {
  let client: Client;
  let mockSteno: Steno;

  beforeEach(async () => {
    mockSteno = createMockSteno();
    const server = createServer(mockSteno);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(clientTransport);
  });

  it('registers exactly 5 tools', async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(5);
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(['steno_feedback', 'steno_graph', 'steno_profile', 'steno_recall', 'steno_remember']);
  });

  describe('steno_remember', () => {
    it('calls steno.add with correct args and returns extraction ID', async () => {
      const result = await client.callTool({
        name: 'steno_remember',
        arguments: { user_id: 'user_1', content: 'I love pizza' },
      });

      expect(mockSteno.add).toHaveBeenCalledWith('user_1', 'I love pizza');
      expect(result.content).toEqual([
        { type: 'text', text: 'Remembered. Extraction ID: ext_123' },
      ]);
    });
  });

  describe('steno_recall', () => {
    it('calls steno.search and formats results with scores and IDs', async () => {
      const result = await client.callTool({
        name: 'steno_recall',
        arguments: { user_id: 'user_1', query: 'food preferences' },
      });

      expect(mockSteno.search).toHaveBeenCalledWith('user_1', 'food preferences', 5);

      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      expect(text).toContain('1. [0.95] User loves pizza (id: fact_1)');
      expect(text).toContain('2. [0.87] User works at Google (id: fact_2)');
    });

    it('uses custom limit when provided', async () => {
      await client.callTool({
        name: 'steno_recall',
        arguments: { user_id: 'user_1', query: 'food', limit: 10 },
      });

      expect(mockSteno.search).toHaveBeenCalledWith('user_1', 'food', 10);
    });

    it('handles empty results', async () => {
      vi.mocked(mockSteno.search).mockResolvedValueOnce({
        results: [],
        query: 'nothing',
      });

      const result = await client.callTool({
        name: 'steno_recall',
        arguments: { user_id: 'user_1', query: 'nothing here' },
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      expect(text).toBe('No memories found.');
    });
  });

  describe('steno_feedback', () => {
    it('calls steno.feedback with positive feedback', async () => {
      const result = await client.callTool({
        name: 'steno_feedback',
        arguments: { fact_id: 'fact_1', useful: true },
      });

      expect(mockSteno.feedback).toHaveBeenCalledWith('fact_1', true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      expect(text).toContain('positive');
    });

    it('calls steno.feedback with negative feedback', async () => {
      const result = await client.callTool({
        name: 'steno_feedback',
        arguments: { fact_id: 'fact_2', useful: false },
      });

      expect(mockSteno.feedback).toHaveBeenCalledWith('fact_2', false);
      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      expect(text).toContain('negative');
    });
  });
});

describe('Missing API key', () => {
  it('createServer works without API key (key validation is in Steno constructor)', () => {
    // The server factory itself doesn't validate the key — that's the SDK's job.
    // The CLI entry point checks STENO_API_KEY and exits with a helpful message.
    // We verify createServer accepts any Steno instance without throwing.
    const mockSteno = createMockSteno();
    const server = createServer(mockSteno);
    expect(server).toBeDefined();
  });
});

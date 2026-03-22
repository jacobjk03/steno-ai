import { describe, it, expect, vi, beforeEach } from 'vitest';
import { stenoMemory } from '../src/index.js';
import type { LanguageModelV1Middleware } from 'ai';

// ── Mock the Steno SDK ──

const mockSearch = vi.fn();
const mockAdd = vi.fn();

vi.mock('@steno-ai/sdk', () => ({
  default: class MockSteno {
    search = mockSearch;
    add = mockAdd;
    constructor(apiKey: string, _opts?: { baseUrl?: string }) {
      if (!apiKey) throw new Error('Steno API key is required');
    }
  },
}));

// ── Helpers ──

function userMessage(text: string) {
  return {
    role: 'user' as const,
    content: [{ type: 'text' as const, text }],
  };
}

function assistantMessage(text: string) {
  return {
    role: 'assistant' as const,
    content: [{ type: 'text' as const, text }],
  };
}

function systemMessage(text: string) {
  return {
    role: 'system' as const,
    content: text,
  };
}

function makeParams(prompt: Array<ReturnType<typeof userMessage | typeof assistantMessage | typeof systemMessage>>) {
  return {
    inputFormat: 'messages' as const,
    mode: { type: 'regular' as const },
    prompt,
  };
}

// Minimal mock for doGenerate result
function makeGenerateResult(text = 'Hello from the LLM') {
  return {
    text,
    finishReason: 'stop' as const,
    usage: { promptTokens: 10, completionTokens: 5 },
    rawCall: { rawPrompt: null, rawSettings: {} },
  };
}

// ── Tests ──

describe('stenoMemory middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('transformParams — memory injection', () => {
    it('searches and injects memories into the prompt', async () => {
      mockSearch.mockResolvedValue({
        results: [
          { id: '1', content: 'User is allergic to peanuts', score: 0.9, scope: 'user', scopeId: 'u1', createdAt: '', updatedAt: '' },
          { id: '2', content: 'User prefers Italian food', score: 0.8, scope: 'user', scopeId: 'u1', createdAt: '', updatedAt: '' },
        ],
        query: 'food',
      });

      const mw = stenoMemory({ apiKey: 'sk_test', userId: 'user_123' });
      const params = makeParams([userMessage('What food should I avoid?')]);

      const result = await mw.transformParams!({ type: 'generate', params: params as any });

      expect(mockSearch).toHaveBeenCalledWith('user_123', 'What food should I avoid?', 5);
      expect(result.prompt).toHaveLength(2); // 1 system (injected) + 1 user
      expect(result.prompt[0]).toEqual({
        role: 'system',
        content: expect.stringContaining('User is allergic to peanuts'),
      });
      expect(result.prompt[0]).toEqual({
        role: 'system',
        content: expect.stringContaining('User prefers Italian food'),
      });
    });

    it('passes through unchanged when no memories found', async () => {
      mockSearch.mockResolvedValue({ results: [], query: 'test' });

      const mw = stenoMemory({ apiKey: 'sk_test', userId: 'user_123' });
      const params = makeParams([userMessage('Hello')]);

      const result = await mw.transformParams!({ type: 'generate', params: params as any });

      expect(result.prompt).toHaveLength(1);
      expect(result.prompt[0]!.role).toBe('user');
    });

    it('passes through unchanged when user message is empty', async () => {
      const mw = stenoMemory({ apiKey: 'sk_test', userId: 'user_123' });
      const params = makeParams([
        { role: 'user' as const, content: [{ type: 'text' as const, text: '' }] },
      ]);

      const result = await mw.transformParams!({ type: 'generate', params: params as any });

      expect(mockSearch).not.toHaveBeenCalled();
      expect(result.prompt).toHaveLength(1);
    });

    it('passes through unchanged when there is no user message', async () => {
      const mw = stenoMemory({ apiKey: 'sk_test', userId: 'user_123' });
      const params = makeParams([systemMessage('You are helpful.')]);

      const result = await mw.transformParams!({ type: 'generate', params: params as any });

      expect(mockSearch).not.toHaveBeenCalled();
      expect(result.prompt).toHaveLength(1);
    });

    it('silently continues when search throws an error', async () => {
      mockSearch.mockRejectedValue(new Error('API down'));

      const mw = stenoMemory({ apiKey: 'sk_test', userId: 'user_123' });
      const params = makeParams([userMessage('Hello')]);

      const result = await mw.transformParams!({ type: 'generate', params: params as any });

      // Original params returned unchanged
      expect(result.prompt).toHaveLength(1);
      expect(result.prompt[0]!.role).toBe('user');
    });

    it('respects custom maxMemories option', async () => {
      mockSearch.mockResolvedValue({ results: [], query: 'test' });

      const mw = stenoMemory({ apiKey: 'sk_test', userId: 'user_123', maxMemories: 10 });
      const params = makeParams([userMessage('Hello')]);

      await mw.transformParams!({ type: 'generate', params: params as any });

      expect(mockSearch).toHaveBeenCalledWith('user_123', 'Hello', 10);
    });

    it('extracts text from the last user message in a multi-turn conversation', async () => {
      mockSearch.mockResolvedValue({ results: [], query: 'test' });

      const mw = stenoMemory({ apiKey: 'sk_test', userId: 'user_123' });
      const params = makeParams([
        userMessage('First question'),
        assistantMessage('First answer'),
        userMessage('Second question'),
      ]);

      await mw.transformParams!({ type: 'generate', params: params as any });

      expect(mockSearch).toHaveBeenCalledWith('user_123', 'Second question', 5);
    });
  });

  describe('wrapGenerate — auto-store', () => {
    it('stores conversation after generation when autoStore is true (default)', async () => {
      mockSearch.mockResolvedValue({ results: [], query: 'test' });
      mockAdd.mockResolvedValue({ extractionId: 'ext_1' });

      const mw = stenoMemory({ apiKey: 'sk_test', userId: 'user_123' });
      const params = makeParams([userMessage('Hello')]);
      const generateResult = makeGenerateResult('Hi there!');

      expect(mw.wrapGenerate).toBeDefined();

      const result = await mw.wrapGenerate!({
        doGenerate: async () => generateResult as any,
        doStream: async () => ({} as any),
        params: params as any,
        model: {} as any,
      });

      expect(result.text).toBe('Hi there!');

      // Wait for the async void store to settle
      await vi.waitFor(() => {
        expect(mockAdd).toHaveBeenCalledWith('user_123', [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ]);
      });
    });

    it('does not define wrapGenerate when autoStore is false', () => {
      const mw = stenoMemory({ apiKey: 'sk_test', userId: 'user_123', autoStore: false });
      expect(mw.wrapGenerate).toBeUndefined();
    });

    it('returns the result even when storage fails', async () => {
      mockAdd.mockRejectedValue(new Error('Storage failed'));

      const mw = stenoMemory({ apiKey: 'sk_test', userId: 'user_123' });
      const params = makeParams([userMessage('Hello')]);
      const generateResult = makeGenerateResult('Response');

      const result = await mw.wrapGenerate!({
        doGenerate: async () => generateResult as any,
        doStream: async () => ({} as any),
        params: params as any,
        model: {} as any,
      });

      // The result should still be returned even if storage failed
      expect(result.text).toBe('Response');
    });

    it('skips system messages when building conversation for storage', async () => {
      mockAdd.mockResolvedValue({ extractionId: 'ext_1' });

      const mw = stenoMemory({ apiKey: 'sk_test', userId: 'user_123' });
      const params = makeParams([
        systemMessage('You are helpful.'),
        userMessage('Hello'),
      ]);
      const generateResult = makeGenerateResult('Hi!');

      await mw.wrapGenerate!({
        doGenerate: async () => generateResult as any,
        doStream: async () => ({} as any),
        params: params as any,
        model: {} as any,
      });

      await vi.waitFor(() => {
        expect(mockAdd).toHaveBeenCalledWith('user_123', [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi!' },
        ]);
      });
    });

    it('does not store when there are no user/assistant messages and no generated text', async () => {
      const mw = stenoMemory({ apiKey: 'sk_test', userId: 'user_123' });
      const params = makeParams([systemMessage('System only')]);
      const generateResult = makeGenerateResult('');

      await mw.wrapGenerate!({
        doGenerate: async () => generateResult as any,
        doStream: async () => ({} as any),
        params: params as any,
        model: {} as any,
      });

      // Give async operations a moment
      await new Promise((r) => setTimeout(r, 10));

      expect(mockAdd).not.toHaveBeenCalled();
    });
  });

  describe('middleware structure', () => {
    it('sets middlewareVersion to v1', () => {
      const mw = stenoMemory({ apiKey: 'sk_test', userId: 'user_123' });
      expect(mw.middlewareVersion).toBe('v1');
    });

    it('does not define wrapStream (streaming storage not yet implemented)', () => {
      const mw = stenoMemory({ apiKey: 'sk_test', userId: 'user_123' });
      expect(mw.wrapStream).toBeUndefined();
    });
  });
});

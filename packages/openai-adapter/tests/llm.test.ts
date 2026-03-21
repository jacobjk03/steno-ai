import { describe, it, expect, vi } from 'vitest';
import { OpenAILLMAdapter } from '../src/llm.js';

function makeMockClient(overrides: Partial<{ content: string | null; promptTokens: number; completionTokens: number; model: string }> = {}) {
  const content = overrides.content !== undefined ? overrides.content : 'Hello from OpenAI';
  const promptTokens = overrides.promptTokens ?? 10;
  const completionTokens = overrides.completionTokens ?? 20;
  const model = overrides.model ?? 'gpt-4.1-nano';

  const createFn = vi.fn().mockResolvedValue({
    choices: content !== null ? [{ message: { content } }] : [{ message: {} }],
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
    model,
  });

  return {
    chat: { completions: { create: createFn } },
    _createFn: createFn,
  } as unknown as ReturnType<typeof makeMockClient>;
}

describe('OpenAILLMAdapter', () => {
  it('returns content from completion', async () => {
    const mock = makeMockClient({ content: 'Hello!' });
    const adapter = new OpenAILLMAdapter({ apiKey: 'test', _client: mock as any });
    const result = await adapter.complete([{ role: 'user', content: 'hi' }]);
    expect(result.content).toBe('Hello!');
  });

  it('returns token counts from usage', async () => {
    const mock = makeMockClient({ promptTokens: 42, completionTokens: 7 });
    const adapter = new OpenAILLMAdapter({ apiKey: 'test', _client: mock as any });
    const result = await adapter.complete([{ role: 'user', content: 'hi' }]);
    expect(result.tokensInput).toBe(42);
    expect(result.tokensOutput).toBe(7);
  });

  it('returns model name from response', async () => {
    const mock = makeMockClient({ model: 'gpt-4.1-nano' });
    const adapter = new OpenAILLMAdapter({ apiKey: 'test', _client: mock as any });
    const result = await adapter.complete([{ role: 'user', content: 'hi' }]);
    expect(result.model).toBe('gpt-4.1-nano');
  });

  it('passes temperature and maxTokens options', async () => {
    const mock = makeMockClient();
    const adapter = new OpenAILLMAdapter({ apiKey: 'test', _client: mock as any });
    await adapter.complete([{ role: 'user', content: 'hi' }], { temperature: 0.7, maxTokens: 100 });
    expect((mock as any)._createFn).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.7, max_tokens: 100 }),
    );
  });

  it('uses json response_format when responseFormat is json', async () => {
    const mock = makeMockClient({ content: '{"key":"value"}' });
    const adapter = new OpenAILLMAdapter({ apiKey: 'test', _client: mock as any });
    await adapter.complete([{ role: 'user', content: 'return json' }], { responseFormat: 'json' });
    expect((mock as any)._createFn).toHaveBeenCalledWith(
      expect.objectContaining({ response_format: { type: 'json_object' } }),
    );
  });

  it('does not set response_format when responseFormat is not json', async () => {
    const mock = makeMockClient();
    const adapter = new OpenAILLMAdapter({ apiKey: 'test', _client: mock as any });
    await adapter.complete([{ role: 'user', content: 'hi' }]);
    const callArg = (mock as any)._createFn.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg['response_format']).toBeUndefined();
  });

  it('throws meaningful error on empty response', async () => {
    const mock = makeMockClient({ content: null });
    const adapter = new OpenAILLMAdapter({ apiKey: 'test', _client: mock as any });
    await expect(adapter.complete([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'OpenAI returned empty response',
    );
  });

  it('default model is gpt-4.1-nano', () => {
    const adapter = new OpenAILLMAdapter({ apiKey: 'test' });
    expect(adapter.model).toBe('gpt-4.1-nano');
  });

  it('uses custom model when provided', () => {
    const adapter = new OpenAILLMAdapter({ apiKey: 'test', model: 'gpt-4o' });
    expect(adapter.model).toBe('gpt-4o');
  });
});

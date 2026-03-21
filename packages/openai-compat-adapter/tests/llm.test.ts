import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAICompatLLMAdapter } from '../src/llm.js';

const BASE_URL = 'http://localhost:11434/v1';

function mockFetchSuccess(data: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

function mockFetchError(status: number, body: string) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: () => Promise.resolve(body),
  });
}

describe('OpenAICompatLLMAdapter', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends correct request to /chat/completions', async () => {
    const fetchMock = mockFetchSuccess({
      choices: [{ message: { content: 'Hello!' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
      model: 'mistral',
    });
    globalThis.fetch = fetchMock;

    const adapter = new OpenAICompatLLMAdapter({ baseUrl: BASE_URL, model: 'mistral' });
    await adapter.complete([{ role: 'user', content: 'hi' }]);

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/chat/completions`,
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"model":"mistral"'),
      }),
    );
  });

  it('returns content and token counts', async () => {
    globalThis.fetch = mockFetchSuccess({
      choices: [{ message: { content: 'response text' } }],
      usage: { prompt_tokens: 42, completion_tokens: 7 },
      model: 'mistral',
    });

    const adapter = new OpenAICompatLLMAdapter({ baseUrl: BASE_URL, model: 'mistral' });
    const result = await adapter.complete([{ role: 'user', content: 'hi' }]);

    expect(result.content).toBe('response text');
    expect(result.tokensInput).toBe(42);
    expect(result.tokensOutput).toBe(7);
  });

  it('passes temperature, maxTokens, and responseFormat', async () => {
    const fetchMock = mockFetchSuccess({
      choices: [{ message: { content: '{}' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
      model: 'mistral',
    });
    globalThis.fetch = fetchMock;

    const adapter = new OpenAICompatLLMAdapter({ baseUrl: BASE_URL, model: 'mistral' });
    await adapter.complete(
      [{ role: 'user', content: 'hi' }],
      { temperature: 0.7, maxTokens: 100, responseFormat: 'json' },
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.temperature).toBe(0.7);
    expect(body.max_tokens).toBe(100);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('custom model name passed through', async () => {
    globalThis.fetch = mockFetchSuccess({
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
      model: 'llama3:8b',
    });

    const adapter = new OpenAICompatLLMAdapter({ baseUrl: BASE_URL, model: 'llama3:8b' });
    expect(adapter.model).toBe('llama3:8b');
    const result = await adapter.complete([{ role: 'user', content: 'hi' }]);
    expect(result.model).toBe('llama3:8b');
  });

  it('no auth header when apiKey not provided', async () => {
    const fetchMock = mockFetchSuccess({
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
      model: 'mistral',
    });
    globalThis.fetch = fetchMock;

    const adapter = new OpenAICompatLLMAdapter({ baseUrl: BASE_URL, model: 'mistral' });
    await adapter.complete([{ role: 'user', content: 'hi' }]);

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('auth header when apiKey provided', async () => {
    const fetchMock = mockFetchSuccess({
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
      model: 'mistral',
    });
    globalThis.fetch = fetchMock;

    const adapter = new OpenAICompatLLMAdapter({ baseUrl: BASE_URL, model: 'mistral', apiKey: 'sk-test-123' });
    await adapter.complete([{ role: 'user', content: 'hi' }]);

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer sk-test-123');
  });

  it('strips trailing slash from baseUrl', async () => {
    const fetchMock = mockFetchSuccess({
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
      model: 'mistral',
    });
    globalThis.fetch = fetchMock;

    const adapter = new OpenAICompatLLMAdapter({ baseUrl: 'http://localhost:11434/v1/', model: 'mistral' });
    await adapter.complete([{ role: 'user', content: 'hi' }]);

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/v1/chat/completions');
  });

  it('timeout triggers clear error message', async () => {
    globalThis.fetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        init.signal?.addEventListener('abort', () => reject(err));
      });
    });

    const adapter = new OpenAICompatLLMAdapter({ baseUrl: BASE_URL, model: 'mistral', timeout: 10 });
    await expect(adapter.complete([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      /timed out after 10ms/,
    );
  });

  it('connection refused gives clear error message', async () => {
    const err = new TypeError('fetch failed');
    globalThis.fetch = vi.fn().mockRejectedValue(err);

    const adapter = new OpenAICompatLLMAdapter({ baseUrl: BASE_URL, model: 'mistral' });
    await expect(adapter.complete([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      /not available at.*Ensure your model server is running/,
    );
  });

  it('HTTP error includes status code in message', async () => {
    globalThis.fetch = mockFetchError(503, 'Service Unavailable');

    const adapter = new OpenAICompatLLMAdapter({ baseUrl: BASE_URL, model: 'mistral' });
    await expect(adapter.complete([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      /LLM provider error \(503\): Service Unavailable/,
    );
  });

  it('empty response throws meaningful error', async () => {
    globalThis.fetch = mockFetchSuccess({
      choices: [{ message: {} }],
      usage: { prompt_tokens: 1, completion_tokens: 0 },
      model: 'mistral',
    });

    const adapter = new OpenAICompatLLMAdapter({ baseUrl: BASE_URL, model: 'mistral' });
    await expect(adapter.complete([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      /empty response/,
    );
  });
});

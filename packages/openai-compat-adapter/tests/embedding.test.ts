import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAICompatEmbeddingAdapter } from '../src/embedding.js';

const BASE_URL = 'http://localhost:11434/v1';

function mockFetchSuccess(data: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

describe('OpenAICompatEmbeddingAdapter', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends correct request to /embeddings', async () => {
    const fetchMock = mockFetchSuccess({
      data: [{ embedding: [0.1, 0.2, 0.3] }],
    });
    globalThis.fetch = fetchMock;

    const adapter = new OpenAICompatEmbeddingAdapter({ baseUrl: BASE_URL, model: 'nomic-embed-text' });
    await adapter.embed('hello');

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/embeddings`,
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"model":"nomic-embed-text"'),
      }),
    );
  });

  it('returns vector of numbers', async () => {
    globalThis.fetch = mockFetchSuccess({
      data: [{ embedding: [0.1, 0.2, 0.3] }],
    });

    const adapter = new OpenAICompatEmbeddingAdapter({ baseUrl: BASE_URL, model: 'nomic-embed-text' });
    const result = await adapter.embed('hello');

    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it('embedBatch returns array of arrays', async () => {
    globalThis.fetch = mockFetchSuccess({
      data: [
        { embedding: [0.1, 0.2] },
        { embedding: [0.3, 0.4] },
      ],
    });

    const adapter = new OpenAICompatEmbeddingAdapter({ baseUrl: BASE_URL, model: 'nomic-embed-text' });
    const result = await adapter.embedBatch(['hello', 'world']);

    expect(result).toEqual([[0.1, 0.2], [0.3, 0.4]]);
  });

  it('embedBatch with empty array returns empty', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const adapter = new OpenAICompatEmbeddingAdapter({ baseUrl: BASE_URL, model: 'nomic-embed-text' });
    const result = await adapter.embedBatch([]);

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes model and dimensions', async () => {
    const fetchMock = mockFetchSuccess({
      data: [{ embedding: [0.1] }],
    });
    globalThis.fetch = fetchMock;

    const adapter = new OpenAICompatEmbeddingAdapter({
      baseUrl: BASE_URL,
      model: 'nomic-embed-text',
      dimensions: 384,
    });
    await adapter.embed('hello');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.model).toBe('nomic-embed-text');
    expect(body.dimensions).toBe(384);
  });

  it('timeout triggers clear error', async () => {
    globalThis.fetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        init.signal?.addEventListener('abort', () => reject(err));
      });
    });

    const adapter = new OpenAICompatEmbeddingAdapter({ baseUrl: BASE_URL, model: 'nomic-embed-text', timeout: 10 });
    await expect(adapter.embed('hello')).rejects.toThrow(/timed out after 10ms/);
  });

  it('connection refused gives clear error', async () => {
    const err = new TypeError('fetch failed');
    globalThis.fetch = vi.fn().mockRejectedValue(err);

    const adapter = new OpenAICompatEmbeddingAdapter({ baseUrl: BASE_URL, model: 'nomic-embed-text' });
    await expect(adapter.embed('hello')).rejects.toThrow(
      /not available at.*Ensure your model server is running/,
    );
  });

  it('no auth header when apiKey not provided', async () => {
    const fetchMock = mockFetchSuccess({
      data: [{ embedding: [0.1] }],
    });
    globalThis.fetch = fetchMock;

    const adapter = new OpenAICompatEmbeddingAdapter({ baseUrl: BASE_URL, model: 'nomic-embed-text' });
    await adapter.embed('hello');

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });
});

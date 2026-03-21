import { describe, it, expect, vi } from 'vitest';
import { OpenAIEmbeddingAdapter } from '../src/embedding.js';

function makeMockEmbeddingClient(embeddings: number[][] = [[0.1, 0.2, 0.3]]) {
  const createFn = vi.fn().mockImplementation(({ input }: { input: string | string[] }) => {
    const inputs = Array.isArray(input) ? input : [input];
    const data = inputs.map((_, i) => ({ embedding: embeddings[i] ?? embeddings[0]! }));
    return Promise.resolve({ data });
  });

  return {
    embeddings: { create: createFn },
    _createFn: createFn,
  };
}

describe('OpenAIEmbeddingAdapter', () => {
  it('returns array of numbers for single embed', async () => {
    const mock = makeMockEmbeddingClient([[0.1, 0.2, 0.3]]);
    const adapter = new OpenAIEmbeddingAdapter({ apiKey: 'test', _client: mock as any });
    const result = await adapter.embed('hello');
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it('returns array of arrays for embedBatch', async () => {
    const embeddings = [[0.1, 0.2], [0.3, 0.4]];
    const mock = makeMockEmbeddingClient(embeddings);
    const adapter = new OpenAIEmbeddingAdapter({ apiKey: 'test', _client: mock as any });
    const result = await adapter.embedBatch(['hello', 'world']);
    expect(result).toEqual([[0.1, 0.2], [0.3, 0.4]]);
  });

  it('embedBatch with empty array returns empty array', async () => {
    const mock = makeMockEmbeddingClient();
    const adapter = new OpenAIEmbeddingAdapter({ apiKey: 'test', _client: mock as any });
    const result = await adapter.embedBatch([]);
    expect(result).toEqual([]);
    expect(mock._createFn).not.toHaveBeenCalled();
  });

  it('default model is text-embedding-3-small', () => {
    const adapter = new OpenAIEmbeddingAdapter({ apiKey: 'test' });
    expect(adapter.model).toBe('text-embedding-3-small');
  });

  it('default dimensions is 1536', () => {
    const adapter = new OpenAIEmbeddingAdapter({ apiKey: 'test' });
    expect(adapter.dimensions).toBe(1536);
  });

  it('uses custom model when provided', () => {
    const adapter = new OpenAIEmbeddingAdapter({ apiKey: 'test', model: 'text-embedding-3-large' });
    expect(adapter.model).toBe('text-embedding-3-large');
  });

  it('uses custom dimensions when provided', () => {
    const adapter = new OpenAIEmbeddingAdapter({ apiKey: 'test', dimensions: 768 });
    expect(adapter.dimensions).toBe(768);
  });

  it('passes model and dimensions to API call', async () => {
    const mock = makeMockEmbeddingClient([[0.5]]);
    const adapter = new OpenAIEmbeddingAdapter({
      apiKey: 'test',
      model: 'text-embedding-3-large',
      dimensions: 256,
      _client: mock as any,
    });
    await adapter.embed('test');
    expect(mock._createFn).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'text-embedding-3-large', dimensions: 256 }),
    );
  });
});

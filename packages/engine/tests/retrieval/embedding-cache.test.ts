import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CachedEmbeddingAdapter } from '../../src/retrieval/embedding-cache.js';
import type { EmbeddingAdapter } from '../../src/adapters/embedding.js';
import type { CacheAdapter } from '../../src/adapters/cache.js';

function mockEmbeddingAdapter(): EmbeddingAdapter & {
  embed: ReturnType<typeof vi.fn>;
  embedBatch: ReturnType<typeof vi.fn>;
} {
  return {
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]),
    model: 'test-model',
    dimensions: 3,
  };
}

function mockCacheAdapter(): CacheAdapter & {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  incr: ReturnType<typeof vi.fn>;
  expire: ReturnType<typeof vi.fn>;
  ping: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(undefined),
    ping: vi.fn().mockResolvedValue(true),
  };
}

describe('CachedEmbeddingAdapter', () => {
  let inner: ReturnType<typeof mockEmbeddingAdapter>;
  let cache: ReturnType<typeof mockCacheAdapter>;
  let cached: CachedEmbeddingAdapter;

  beforeEach(() => {
    inner = mockEmbeddingAdapter();
    cache = mockCacheAdapter();
    cached = new CachedEmbeddingAdapter(inner, cache);
  });

  it('exposes model and dimensions from inner adapter', () => {
    expect(cached.model).toBe('test-model');
    expect(cached.dimensions).toBe(3);
  });

  describe('embed', () => {
    it('calls inner.embed on cache miss and caches result', async () => {
      cache.get.mockResolvedValue(null);
      inner.embed.mockResolvedValue([0.1, 0.2, 0.3]);

      const result = await cached.embed('hello world');

      expect(result).toEqual([0.1, 0.2, 0.3]);
      expect(inner.embed).toHaveBeenCalledWith('hello world');
      expect(inner.embed).toHaveBeenCalledTimes(1);
      expect(cache.set).toHaveBeenCalledTimes(1);
      // Check that set is called with correct TTL
      expect(cache.set).toHaveBeenCalledWith(
        expect.stringMatching(/^emb:test-model:/),
        [0.1, 0.2, 0.3],
        3600,
      );
    });

    it('returns cached result on cache hit without calling inner', async () => {
      const cachedEmbedding = [0.7, 0.8, 0.9];
      cache.get.mockResolvedValue(cachedEmbedding);

      const result = await cached.embed('hello world');

      expect(result).toEqual(cachedEmbedding);
      expect(inner.embed).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
    });

    it('uses same cache key for same text', async () => {
      cache.get.mockResolvedValue(null);

      await cached.embed('same text');
      const firstKey = cache.get.mock.calls[0][0];

      await cached.embed('same text');
      const secondKey = cache.get.mock.calls[1][0];

      expect(firstKey).toBe(secondKey);
    });

    it('uses different cache keys for different text', async () => {
      cache.get.mockResolvedValue(null);

      await cached.embed('text one');
      const firstKey = cache.get.mock.calls[0][0];

      await cached.embed('text two');
      const secondKey = cache.get.mock.calls[1][0];

      expect(firstKey).not.toBe(secondKey);
    });

    it('uses custom TTL when provided', async () => {
      const customCached = new CachedEmbeddingAdapter(inner, cache, 7200);
      cache.get.mockResolvedValue(null);

      await customCached.embed('hello');

      expect(cache.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        7200,
      );
    });
  });

  describe('embedBatch', () => {
    it('calls inner.embedBatch only for uncached texts', async () => {
      const cached1 = [0.1, 0.2, 0.3];
      // First text cached, second not
      cache.get
        .mockResolvedValueOnce(cached1)   // "text one" is cached
        .mockResolvedValueOnce(null);      // "text two" is not cached

      inner.embedBatch.mockResolvedValue([[0.4, 0.5, 0.6]]);

      const result = await cached.embedBatch(['text one', 'text two']);

      expect(result).toEqual([cached1, [0.4, 0.5, 0.6]]);
      // Only uncached texts sent to inner
      expect(inner.embedBatch).toHaveBeenCalledWith(['text two']);
      // Only the newly computed embedding cached
      expect(cache.set).toHaveBeenCalledTimes(1);
    });

    it('returns all from cache when all texts are cached', async () => {
      cache.get
        .mockResolvedValueOnce([0.1, 0.2, 0.3])
        .mockResolvedValueOnce([0.4, 0.5, 0.6]);

      const result = await cached.embedBatch(['text one', 'text two']);

      expect(result).toEqual([[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]);
      expect(inner.embedBatch).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
    });

    it('calls inner.embedBatch for all texts when none are cached', async () => {
      cache.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      inner.embedBatch.mockResolvedValue([[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]);

      const result = await cached.embedBatch(['text one', 'text two']);

      expect(result).toEqual([[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]);
      expect(inner.embedBatch).toHaveBeenCalledWith(['text one', 'text two']);
      expect(cache.set).toHaveBeenCalledTimes(2);
    });
  });
});

import type { EmbeddingAdapter } from '../adapters/embedding.js';
import type { CacheAdapter } from '../adapters/cache.js';

/**
 * Wraps an EmbeddingAdapter with caching.
 * Same query text -> cached embedding (skip OpenAI call).
 */
export class CachedEmbeddingAdapter implements EmbeddingAdapter {
  readonly model: string;
  readonly dimensions: number;

  constructor(
    private inner: EmbeddingAdapter,
    private cache: CacheAdapter,
    private ttlSeconds: number = 3600, // 1 hour default
  ) {
    this.model = inner.model;
    this.dimensions = inner.dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const key = `emb:${this.model}:${await hashText(text)}`;
    const cached = await this.cache.get<number[]>(key);
    if (cached) return cached;

    const result = await this.inner.embed(text);
    await this.cache.set(key, result, this.ttlSeconds);
    return result;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // For batch, check cache for each, only embed uncached ones
    const results: (number[] | null)[] = [];
    const uncachedIndices: number[] = [];

    for (let i = 0; i < texts.length; i++) {
      const key = `emb:${this.model}:${await hashText(texts[i]!)}`;
      const cached = await this.cache.get<number[]>(key);
      results.push(cached);
      if (!cached) uncachedIndices.push(i);
    }

    if (uncachedIndices.length > 0) {
      const uncachedTexts = uncachedIndices.map(i => texts[i]!);
      const freshEmbeddings = await this.inner.embedBatch(uncachedTexts);

      for (let j = 0; j < uncachedIndices.length; j++) {
        const idx = uncachedIndices[j]!;
        results[idx] = freshEmbeddings[j]!;
        const key = `emb:${this.model}:${await hashText(texts[idx]!)}`;
        await this.cache.set(key, freshEmbeddings[j]!, this.ttlSeconds);
      }
    }

    return results as number[][];
  }
}

async function hashText(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

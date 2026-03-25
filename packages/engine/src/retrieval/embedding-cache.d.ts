import type { EmbeddingAdapter } from '../adapters/embedding.js';
import type { CacheAdapter } from '../adapters/cache.js';
/**
 * Wraps an EmbeddingAdapter with caching.
 * Same query text -> cached embedding (skip OpenAI call).
 */
export declare class CachedEmbeddingAdapter implements EmbeddingAdapter {
    private inner;
    private cache;
    private ttlSeconds;
    readonly model: string;
    readonly dimensions: number;
    constructor(inner: EmbeddingAdapter, cache: CacheAdapter, ttlSeconds?: number);
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
}
//# sourceMappingURL=embedding-cache.d.ts.map
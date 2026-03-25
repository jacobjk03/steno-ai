/**
 * Wraps an EmbeddingAdapter with caching.
 * Same query text -> cached embedding (skip OpenAI call).
 */
export class CachedEmbeddingAdapter {
    inner;
    cache;
    ttlSeconds;
    model;
    dimensions;
    constructor(inner, cache, ttlSeconds = 3600) {
        this.inner = inner;
        this.cache = cache;
        this.ttlSeconds = ttlSeconds;
        this.model = inner.model;
        this.dimensions = inner.dimensions;
    }
    async embed(text) {
        const key = `emb:${this.model}:${await hashText(text)}`;
        const cached = await this.cache.get(key);
        if (cached)
            return cached;
        const result = await this.inner.embed(text);
        await this.cache.set(key, result, this.ttlSeconds);
        return result;
    }
    async embedBatch(texts) {
        // For batch, check cache for each, only embed uncached ones
        const results = [];
        const uncachedIndices = [];
        for (let i = 0; i < texts.length; i++) {
            const key = `emb:${this.model}:${await hashText(texts[i])}`;
            const cached = await this.cache.get(key);
            results.push(cached);
            if (!cached)
                uncachedIndices.push(i);
        }
        if (uncachedIndices.length > 0) {
            const uncachedTexts = uncachedIndices.map(i => texts[i]);
            const freshEmbeddings = await this.inner.embedBatch(uncachedTexts);
            for (let j = 0; j < uncachedIndices.length; j++) {
                const idx = uncachedIndices[j];
                results[idx] = freshEmbeddings[j];
                const key = `emb:${this.model}:${await hashText(texts[idx])}`;
                await this.cache.set(key, freshEmbeddings[j], this.ttlSeconds);
            }
        }
        return results;
    }
}
async function hashText(text) {
    const encoded = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}
//# sourceMappingURL=embedding-cache.js.map
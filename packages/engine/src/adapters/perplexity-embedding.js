/**
 * Perplexity embedding adapter using pplx-embed models.
 * SOTA quality at $0.03/1M tokens for pplx-embed-v1-4b.
 *
 * IMPORTANT: Perplexity returns base64-encoded int8 embeddings by default.
 * These are decoded to float32 and L2-normalized for cosine similarity compatibility
 * with pgvector and other vector DBs.
 */
export class PerplexityEmbeddingAdapter {
    model;
    dimensions;
    apiKey;
    baseUrl = 'https://api.perplexity.ai/v1/embeddings';
    constructor(config) {
        this.apiKey = config.apiKey;
        this.model = config.model ?? 'pplx-embed-v1-4b';
        this.dimensions = config.dimensions ?? 2000;
    }
    async embed(text) {
        const results = await this.embedBatch([text]);
        return results[0];
    }
    async embedBatch(texts) {
        if (texts.length === 0)
            return [];
        const response = await fetch(this.baseUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                input: texts,
                model: this.model,
                ...(this.dimensions !== 2560 ? { dimensions: this.dimensions } : {}),
            }),
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Perplexity embedding failed (${response.status}): ${error}`);
        }
        const data = await response.json();
        // Sort by index to ensure correct order
        const sorted = data.data.sort((a, b) => a.index - b.index);
        // Decode base64 int8 → float32 → L2-normalize
        return sorted.map(d => decodeAndNormalize(d.embedding));
    }
}
/**
 * Decode a base64-encoded int8 embedding to a normalized float32 array.
 * Perplexity embeddings are unnormalized int8 — we must L2-normalize
 * for cosine similarity to work correctly with pgvector.
 */
function decodeAndNormalize(b64String) {
    // Decode base64 using atob (works in both Node.js and browsers)
    const binaryStr = atob(b64String);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }
    const int8 = new Int8Array(bytes.buffer);
    const float32 = new Array(int8.length);
    // Convert int8 to float32 and compute norm
    let norm = 0;
    for (let i = 0; i < int8.length; i++) {
        float32[i] = int8[i];
        norm += float32[i] * float32[i];
    }
    // L2-normalize so cosine similarity == inner product in pgvector
    norm = Math.sqrt(norm);
    if (norm > 0) {
        for (let i = 0; i < float32.length; i++) {
            float32[i] = float32[i] / norm;
        }
    }
    return float32;
}
//# sourceMappingURL=perplexity-embedding.js.map
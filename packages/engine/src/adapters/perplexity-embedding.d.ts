import type { EmbeddingAdapter } from './embedding.js';
export interface PerplexityEmbeddingConfig {
    apiKey: string;
    model?: string;
    dimensions?: number;
}
/**
 * Perplexity embedding adapter using pplx-embed models.
 * SOTA quality at $0.03/1M tokens for pplx-embed-v1-4b.
 *
 * IMPORTANT: Perplexity returns base64-encoded int8 embeddings by default.
 * These are decoded to float32 and L2-normalized for cosine similarity compatibility
 * with pgvector and other vector DBs.
 */
export declare class PerplexityEmbeddingAdapter implements EmbeddingAdapter {
    readonly model: string;
    readonly dimensions: number;
    private readonly apiKey;
    private readonly baseUrl;
    constructor(config: PerplexityEmbeddingConfig);
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
}
//# sourceMappingURL=perplexity-embedding.d.ts.map
import type { EmbeddingAdapter } from '../adapters/embedding.js';
import type { SearchResult } from './types.js';
/**
 * Re-rank search results using embedding cosine similarity.
 * Deterministic, free (uses existing embedding model), no LLM call.
 *
 * How it works:
 * 1. Embed the query
 * 2. Embed all fact content texts in a single batch call
 * 3. Compute cosine similarity between query embedding and each fact embedding
 * 4. Blend the similarity score with the original fusion score
 * 5. Re-sort by blended score
 */
export declare function rerank(embedding: EmbeddingAdapter, query: string, results: SearchResult[], topK?: number): Promise<SearchResult[]>;
//# sourceMappingURL=reranker.d.ts.map
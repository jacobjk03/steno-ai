import type { StorageAdapter } from '../adapters/storage.js';
import type { EmbeddingAdapter } from '../adapters/embedding.js';
import type { Candidate } from './types.js';
/**
 * Compound search: embeds the query, then calls storage.compoundSearch
 * (ONE database call for both vector + keyword), and splits results
 * into Candidate format.
 */
export declare function compoundSearchSignal(storage: StorageAdapter, embedding: EmbeddingAdapter, query: string, tenantId: string, scope: string, scopeId: string, limit: number): Promise<{
    vectorCandidates: Candidate[];
    keywordCandidates: Candidate[];
}>;
//# sourceMappingURL=compound-search.d.ts.map
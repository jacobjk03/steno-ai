import type { StorageAdapter } from '../adapters/storage.js';
import type { EmbeddingAdapter } from '../adapters/embedding.js';
import type { Candidate } from './types.js';
export interface GraphSearchConfig {
    maxDepth: number;
    maxEntities: number;
    asOf?: Date;
}
/**
 * Tokenize query into candidate entity names.
 * Splits on whitespace, filters short words (< 3 chars), lowercases for canonical lookup.
 */
export declare function tokenizeQuery(query: string): string[];
/**
 * Graph-based retrieval module.
 *
 * 1. Extracts potential entity names from query (simple tokenization)
 * 2. For each token, tries to find matching entities by canonical name
 * 3. Uses found entity IDs as seeds for graphTraversal
 * 4. Gets facts connected to discovered entities via getFactsForEntity
 * 5. Assigns graphScore based on hop distance: 1/(2^hop_depth)
 *    - 0-hop (seed) = 1.0
 *    - 1-hop = 0.5
 *    - 2-hop = 0.25
 *    - 3-hop = 0.125
 */
export declare function graphSearch(storage: StorageAdapter, embedding: EmbeddingAdapter, query: string, tenantId: string, _scope: string, _scopeId: string, limit: number, config?: Partial<GraphSearchConfig>): Promise<Candidate[]>;
//# sourceMappingURL=graph-traversal.d.ts.map
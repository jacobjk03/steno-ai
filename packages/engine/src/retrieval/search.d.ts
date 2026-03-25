import type { StorageAdapter } from '../adapters/storage.js';
import type { EmbeddingAdapter } from '../adapters/embedding.js';
import type { CacheAdapter } from '../adapters/cache.js';
import type { LLMAdapter } from '../adapters/llm.js';
import type { SearchOptions, SearchResponse, FusionWeights } from './types.js';
export interface SearchConfig {
    storage: StorageAdapter;
    embedding: EmbeddingAdapter;
    cache?: CacheAdapter;
    defaultWeights?: FusionWeights;
    salienceHalfLifeDays?: number;
    salienceNormalizationK?: number;
    graphMaxDepth?: number;
    graphMaxEntities?: number;
    rerankerLLM?: LLMAdapter;
    rerank?: boolean;
    /** LLM for query expansion (optional — falls back to heuristic expansion) */
    expansionLLM?: LLMAdapter;
}
export declare function search(config: SearchConfig, options: SearchOptions): Promise<SearchResponse>;
//# sourceMappingURL=search.d.ts.map
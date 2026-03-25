import type { EmbeddingAdapter } from '../adapters/embedding.js';
import type { LLMAdapter } from '../adapters/llm.js';
import type { StorageAdapter } from '../adapters/storage.js';
import type { ExtractedFact } from './types.js';
export interface DedupConfig {
    storage: StorageAdapter;
    embedding: EmbeddingAdapter;
    llm: LLMAdapter;
    similarityThreshold?: number;
}
export declare function deduplicateFacts(config: DedupConfig, facts: ExtractedFact[], tenantId: string, scope: string, scopeId: string): Promise<ExtractedFact[]>;
//# sourceMappingURL=dedup.d.ts.map
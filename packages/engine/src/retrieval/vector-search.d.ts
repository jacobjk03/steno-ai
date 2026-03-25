import type { StorageAdapter } from '../adapters/storage.js';
import type { EmbeddingAdapter } from '../adapters/embedding.js';
import type { Candidate } from './types.js';
export declare function vectorSearch(storage: StorageAdapter, embedding: EmbeddingAdapter, query: string, tenantId: string, scope: string, scopeId: string, limit: number, asOf?: Date): Promise<Candidate[]>;
//# sourceMappingURL=vector-search.d.ts.map
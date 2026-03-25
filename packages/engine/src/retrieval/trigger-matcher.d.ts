import type { StorageAdapter } from '../adapters/storage.js';
import type { EmbeddingAdapter } from '../adapters/embedding.js';
import type { Candidate } from './types.js';
import type { TriggerCondition } from '../models/trigger.js';
export declare function matchTriggers(storage: StorageAdapter, embedding: EmbeddingAdapter, query: string, tenantId: string, scope: string, scopeId: string): Promise<{
    candidates: Candidate[];
    triggersMatched: string[];
}>;
/** Evaluate a trigger condition against query text */
export declare function evaluateCondition(condition: TriggerCondition, query: string, context: {
    storage: StorageAdapter;
    embedding: EmbeddingAdapter;
    tenantId: string;
    scope: string;
    scopeId: string;
}): Promise<boolean>;
export declare function cosineSimilarity(a: number[], b: number[]): number;
//# sourceMappingURL=trigger-matcher.d.ts.map
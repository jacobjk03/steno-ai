import type { StorageAdapter } from '../adapters/storage.js';
import type { SearchResult } from '../retrieval/types.js';
import type { FeedbackType } from '../config.js';
/**
 * Record memory accesses after a search.
 * Also updates last_accessed and frequency on accessed facts.
 * This is called fire-and-forget from the search orchestrator.
 */
export declare function recordAccesses(storage: StorageAdapter, tenantId: string, query: string, results: SearchResult[], config?: {
    halfLifeDays?: number;
    normalizationK?: number;
}): Promise<void>;
/**
 * Submit user feedback for a retrieved memory.
 * Adjusts the fact's importance score based on feedback.
 */
export declare function submitFeedback(storage: StorageAdapter, tenantId: string, factId: string, feedback: {
    wasUseful: boolean;
    feedbackType: FeedbackType;
    feedbackDetail?: string;
}, config?: {
    halfLifeDays?: number;
    normalizationK?: number;
}): Promise<void>;
//# sourceMappingURL=tracker.d.ts.map
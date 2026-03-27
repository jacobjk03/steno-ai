import type { Candidate } from './types.js';
export interface TimeReference {
    year?: number;
    month?: number;
    day?: number;
    ordering?: 'first' | 'last';
}
/**
 * Extract temporal references from a search query.
 * Returns null if query has no temporal component.
 */
export declare function extractTimeReference(query: string): TimeReference | null;
/**
 * Score candidates by temporal proximity to the query's time reference.
 * Mutates candidates in place, setting their `temporalScore`.
 */
export declare function scoreTemporalRelevance(candidates: Candidate[], timeRef: TimeReference): void;
//# sourceMappingURL=temporal-scorer.d.ts.map
import type { Candidate, FusionWeights } from './types.js';
import type { Fact } from '../models/fact.js';
export interface FusionResult {
    fact: Fact;
    score: number;
    signals: {
        vectorScore: number;
        keywordScore: number;
        graphScore: number;
        recencyScore: number;
        salienceScore: number;
    };
    source: string;
    triggeredBy?: string;
}
/**
 * Fuse candidates from multiple retrieval signals into a single ranked list.
 *
 * 1. Normalizes weights so they sum to 1.0
 * 2. Deduplicates by fact ID, keeping the highest score per signal
 * 3. Computes a weighted sum for each unique fact
 * 4. Sorts by score descending
 * 5. Returns the top `limit` results
 */
export declare function fuseAndRank(candidates: Candidate[], weights: FusionWeights, limit: number): FusionResult[];
//# sourceMappingURL=fusion.d.ts.map
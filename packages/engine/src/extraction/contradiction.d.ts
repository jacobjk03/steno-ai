import type { ExtractedFact } from './types.js';
import type { ContradictionStatus } from '../config.js';
export interface ContradictionResult {
    fact: ExtractedFact;
    contradictionStatus: ContradictionStatus;
    contradictsId: string | null;
}
/**
 * Process extracted facts and annotate contradictions.
 * Facts with operation='contradict' get contradictionStatus='active'
 * and contradictsId set to the fact they contradict.
 * All other facts get contradictionStatus='none'.
 */
export declare function processContradictions(facts: ExtractedFact[]): ContradictionResult[];
//# sourceMappingURL=contradiction.d.ts.map
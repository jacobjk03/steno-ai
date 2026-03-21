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
export function processContradictions(
  facts: ExtractedFact[]
): ContradictionResult[] {
  return facts.map(fact => {
    if (fact.operation === 'contradict' && fact.contradictsFactId) {
      return {
        fact,
        contradictionStatus: 'active' as const,
        contradictsId: fact.contradictsFactId,
      };
    }
    return {
      fact,
      contradictionStatus: 'none' as const,
      contradictsId: null,
    };
  });
}

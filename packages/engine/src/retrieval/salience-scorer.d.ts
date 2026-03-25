import type { Candidate } from './types.js';
export interface SalienceConfig {
    halfLifeDays: number;
    normalizationK: number;
}
/**
 * Score all candidates with recency and salience signals.
 *
 * recencyScore = pure time decay (how recently the fact was accessed)
 * salienceScore = importance x frequency factor (how important and reinforced)
 *
 * These are separate signals that feed into fusion with independent weights.
 */
export declare function scoreSalience(candidates: Candidate[], config?: Partial<SalienceConfig>): Candidate[];
//# sourceMappingURL=salience-scorer.d.ts.map
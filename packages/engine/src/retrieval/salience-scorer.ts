import type { Candidate } from './types.js';

export interface SalienceConfig {
  halfLifeDays: number;      // default 30
  normalizationK: number;    // default 50
}

/**
 * Score all candidates with recency and salience signals.
 *
 * recencyScore = pure time decay (how recently the fact was accessed)
 * salienceScore = importance x frequency factor (how important and reinforced)
 *
 * These are separate signals that feed into fusion with independent weights.
 */
export function scoreSalience(
  candidates: Candidate[],
  config?: Partial<SalienceConfig>,
): Candidate[] {
  const halfLifeDays = config?.halfLifeDays ?? 30;
  const normalizationK = config?.normalizationK ?? 50;

  return candidates.map(candidate => {
    const { fact } = candidate;

    // Recency: pure time decay based on last access
    // exp(-lambda * days_since_last_access) where lambda = ln(2) / halfLifeDays
    const daysSinceAccess = fact.lastAccessed
      ? (Date.now() - new Date(fact.lastAccessed).getTime()) / (1000 * 60 * 60 * 24)
      : Infinity;

    const lambda = Math.LN2 / halfLifeDays;
    const recencyScore = fact.lastAccessed
      ? Math.exp(-lambda * daysSinceAccess)
      : 0;

    // Salience: importance x frequency factor
    // This captures "how important is this fact AND how often has it been reinforced"
    const frequencyFactor = Math.min(1.0, Math.log(1 + fact.frequency) / Math.log(1 + normalizationK));
    const salienceScore = fact.importance * frequencyFactor;

    return {
      ...candidate,
      recencyScore: Math.max(0, Math.min(1, recencyScore)),
      salienceScore: Math.max(0, Math.min(1, salienceScore)),
    };
  });
}

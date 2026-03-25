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
    temporalScore: number;
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
export function fuseAndRank(
  candidates: Candidate[],
  weights: FusionWeights,
  limit: number,
): FusionResult[] {
  if (candidates.length === 0) return [];

  // 1. Normalize weights so they sum to 1.0
  const sum =
    weights.vector +
    weights.keyword +
    weights.graph +
    weights.recency +
    weights.salience +
    weights.temporal;

  const w: FusionWeights =
    sum === 0
      ? { vector: 1/6, keyword: 1/6, graph: 1/6, recency: 1/6, salience: 1/6, temporal: 1/6 }
      : {
          vector: weights.vector / sum,
          keyword: weights.keyword / sum,
          graph: weights.graph / sum,
          recency: weights.recency / sum,
          salience: weights.salience / sum,
          temporal: weights.temporal / sum,
        };

  // 2. Deduplicate by fact ID — keep highest score per signal
  const factMap = new Map<
    string,
    {
      fact: Fact;
      vectorScore: number;
      keywordScore: number;
      graphScore: number;
      recencyScore: number;
      salienceScore: number;
      temporalScore: number;
      source: string;
      triggeredBy?: string;
    }
  >();

  for (const c of candidates) {
    const existing = factMap.get(c.fact.id);
    if (existing) {
      existing.vectorScore = Math.max(existing.vectorScore, c.vectorScore);
      existing.keywordScore = Math.max(existing.keywordScore, c.keywordScore);
      existing.graphScore = Math.max(existing.graphScore, c.graphScore);
      existing.recencyScore = Math.max(existing.recencyScore, c.recencyScore);
      existing.salienceScore = Math.max(existing.salienceScore, c.salienceScore);
      existing.temporalScore = Math.max(existing.temporalScore, c.temporalScore);
      if (c.triggeredBy) existing.triggeredBy = c.triggeredBy;
    } else {
      factMap.set(c.fact.id, {
        fact: c.fact,
        vectorScore: c.vectorScore,
        keywordScore: c.keywordScore,
        graphScore: c.graphScore,
        recencyScore: c.recencyScore,
        salienceScore: c.salienceScore,
        temporalScore: c.temporalScore,
        source: c.source,
        triggeredBy: c.triggeredBy,
      });
    }
  }

  // 3. Compute final score for each unique fact
  const results: FusionResult[] = [];
  for (const entry of factMap.values()) {
    const score =
      entry.vectorScore * w.vector +
      entry.keywordScore * w.keyword +
      entry.graphScore * w.graph +
      entry.recencyScore * w.recency +
      entry.salienceScore * w.salience +
      entry.temporalScore * w.temporal;

    results.push({
      fact: entry.fact,
      score,
      signals: {
        vectorScore: entry.vectorScore,
        keywordScore: entry.keywordScore,
        graphScore: entry.graphScore,
        recencyScore: entry.recencyScore,
        salienceScore: entry.salienceScore,
        temporalScore: entry.temporalScore,
      },
      source: entry.source,
      triggeredBy: entry.triggeredBy,
    });
  }

  // 4. Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // 5. Take top N
  return results.slice(0, limit);
}

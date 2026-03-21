import type { StorageAdapter } from '../adapters/storage.js';
import type { Candidate } from './types.js';

export async function keywordSearch(
  storage: StorageAdapter,
  query: string,
  tenantId: string,
  scope: string,
  scopeId: string,
  limit: number,
  asOf?: Date,
): Promise<Candidate[]> {
  const results = await storage.keywordSearch({
    query,
    tenantId,
    scope,
    scopeId,
    limit,
    validOnly: true,
    asOf,
  });

  if (results.length === 0) return [];

  // Normalize rank scores to [0, 1] range.
  // ts_rank returns arbitrary positive values; normalize by dividing by max.
  const maxRank = Math.max(...results.map((r) => r.rankScore));

  return results.map((r) => ({
    fact: r.fact,
    vectorScore: 0,
    keywordScore: maxRank > 0 ? r.rankScore / maxRank : 0,
    graphScore: 0,
    recencyScore: 0,
    salienceScore: 0,
    source: 'keyword' as const,
  }));
}

import type { StorageAdapter } from '../adapters/storage.js';
import type { EmbeddingAdapter } from '../adapters/embedding.js';
import type { Candidate } from './types.js';

export async function vectorSearch(
  storage: StorageAdapter,
  embedding: EmbeddingAdapter,
  query: string,
  tenantId: string,
  scope: string,
  scopeId: string,
  limit: number,
  asOf?: Date,
): Promise<Candidate[]> {
  const queryEmbedding = await embedding.embed(query);

  const results = await storage.vectorSearch({
    embedding: queryEmbedding,
    tenantId,
    scope,
    scopeId,
    limit,
    minSimilarity: 0.0,
    validOnly: true,
    asOf,
  });

  return results.map((r) => ({
    fact: r.fact,
    vectorScore: r.similarity,
    keywordScore: 0,
    graphScore: 0,
    recencyScore: 0,
    salienceScore: 0,
    source: 'vector' as const,
  }));
}

import type { StorageAdapter } from '../adapters/storage.js';
import type { EmbeddingAdapter } from '../adapters/embedding.js';
import type { SearchOptions, Candidate } from './types.js';

/**
 * Compound search: embeds the query, then calls storage.compoundSearch
 * (ONE database call for both vector + keyword), and splits results
 * into Candidate format.
 */
export async function compoundSearchSignal(
  storage: StorageAdapter,
  embedding: EmbeddingAdapter,
  query: string,
  tenantId: string,
  scope: string,
  scopeId: string,
  limit: number,
): Promise<{ vectorCandidates: Candidate[]; keywordCandidates: Candidate[] }> {
  const queryEmbedding = await embedding.embed(query);

  // Extract key content words for keyword search (strip question words and stop words)
  const stopWords = new Set(['what', 'when', 'where', 'who', 'why', 'how', 'which', 'is', 'are', 'was', 'were', 'did', 'does', 'do', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'and', 'or', 'but', 'not', 'if', 'would', 'could', 'should', 'still', 'have', 'has', 'had', 'been', 'be', 'will', 'can', 'that', 'this', 'it', 'its', 'her', 'his', 'she', 'he', 'they', 'them', 'their', 'my', 'your', 'our', 'user', 'users', 'about', 'know', 'tell', 'like', 'want', 'need', 'think', 'use', 'make', 'get', 'any', 'all', 'some', 'just', 'also', 'very']);
  const keywordQuery = query.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !stopWords.has(w))
    .join(' | ');

  const results = await storage.compoundSearch({
    embedding: queryEmbedding,
    query: keywordQuery || query,
    tenantId,
    scope,
    scopeId,
    limit,
    minSimilarity: 0.0,
  });

  const vectorCandidates: Candidate[] = [];
  const keywordCandidates: Candidate[] = [];

  for (const r of results) {
    if (r.source === 'vector') {
      vectorCandidates.push({
        fact: r.fact,
        vectorScore: r.relevanceScore,
        keywordScore: 0,
        graphScore: 0,
        recencyScore: 0,
        salienceScore: 0,
        source: 'vector',
      });
    } else {
      keywordCandidates.push({
        fact: r.fact,
        vectorScore: 0,
        keywordScore: r.relevanceScore,
        graphScore: 0,
        recencyScore: 0,
        salienceScore: 0,
        source: 'keyword',
      });
    }
  }

  // Normalize keyword scores to [0, 1] range (same as keyword-search.ts)
  if (keywordCandidates.length > 0) {
    const maxRank = Math.max(...keywordCandidates.map(c => c.keywordScore));
    if (maxRank > 0) {
      for (const c of keywordCandidates) {
        c.keywordScore = c.keywordScore / maxRank;
      }
    }
  }

  return { vectorCandidates, keywordCandidates };
}

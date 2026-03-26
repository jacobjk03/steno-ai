import type { StorageAdapter } from '../adapters/storage.js';
import type { EmbeddingAdapter } from '../adapters/embedding.js';
import type { SearchOptions, Candidate } from './types.js';

/**
 * Words to strip from search queries before keyword matching.
 * Only question/function words that appear in queries but rarely in stored facts.
 *
 * NOTE: We intentionally do NOT strip "user" even though it appears in most facts.
 * PostgreSQL's ts_rank uses IDF (inverse document frequency) weighting internally,
 * so "user" gets near-zero weight when it appears in most documents. This is the
 * correct behavior — ts_rank("user | hono") will score a fact containing "hono"
 * much higher than one containing only "user", even though both match the tsquery.
 */
const QUERY_STOP_WORDS = new Set([
  // Question words
  'what', 'when', 'where', 'who', 'why', 'how', 'which',
  // Auxiliary verbs from questions
  'is', 'are', 'was', 'were', 'did', 'does', 'do', 'will', 'can', 'could', 'would', 'should',
  'have', 'has', 'had', 'been', 'be',
  // Articles and prepositions
  'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  // Conjunctions
  'and', 'or', 'but', 'not', 'if', 'still',
  // Pronouns
  'it', 'its', 'her', 'his', 'she', 'he', 'they', 'them', 'their', 'my', 'your', 'our',
  'that', 'this',
]);

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

  // Extract content words, join with OR for to_tsquery
  // ts_rank handles IDF weighting — high-frequency terms get low scores automatically
  const keywordQuery = query.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !QUERY_STOP_WORDS.has(w))
    .join(' | ');

  const results = await storage.compoundSearch({
    embedding: queryEmbedding,
    query: keywordQuery || query,
    tenantId,
    scope,
    scopeId,
    limit,
    minSimilarity: 0.25,  // low threshold — let fusion scoring handle ranking, not hard cutoffs
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
        temporalScore: 0,
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
        temporalScore: 0,
        source: 'keyword',
      });
    }
  }

  // Normalize keyword scores to [0, 1] range
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

import type { LLMAdapter } from '../adapters/llm.js';
import type { SearchResult } from './types.js';

/**
 * Re-rank search results using an LLM.
 * The LLM reads all results and selects the most relevant ones for the query.
 * This catches cases where vector similarity misses semantic relevance.
 *
 * Cost: ~$0.001 per call (one cheap LLM call with ~2K tokens)
 */
export async function rerank(
  llm: LLMAdapter,
  query: string,
  results: SearchResult[],
  topK: number = 10,
): Promise<SearchResult[]> {
  if (results.length === 0) return [];
  if (results.length <= 1) return results; // Only skip if 0 or 1 results

  // Build context: numbered list of result contents
  const numbered = results.map((r, i) => `[${i}] ${r.fact.content}`).join('\n');

  try {
    const response = await llm.complete([
      {
        role: 'system',
        content: `You are a relevance ranker. Given a query and a numbered list of memory facts, return the indices of the ${topK} MOST RELEVANT facts for answering the query, ordered by relevance (most relevant first).

Rules:
- Consider semantic relevance, not just keyword matching
- A fact about "User loves Casey" IS relevant to "who is the partner" because loving someone implies partnership
- A fact about "User works at Google" IS relevant to "where does User work" even if phrased differently
- Include facts that provide indirect evidence or context
- Return ONLY a JSON array of indices, e.g. [3, 0, 7, 1, 5]`
      },
      {
        role: 'user',
        content: `Query: ${query}\n\nFacts:\n${numbered}`
      }
    ], { temperature: 0, responseFormat: 'json' });

    // Parse the indices
    const parsed = JSON.parse(response.content);
    const indices: number[] = Array.isArray(parsed) ? parsed : (parsed.indices ?? parsed.results ?? []);

    // Reorder results by LLM ranking
    const reranked: SearchResult[] = [];
    for (const idx of indices) {
      if (typeof idx === 'number' && idx >= 0 && idx < results.length) {
        const result = results[idx]!;
        reranked.push({
          ...result,
          score: 1 - (reranked.length / indices.length), // Re-score: 1st = 1.0, last = 0.0
        });
      }
    }

    // Add any results the LLM missed (shouldn't happen but safety)
    for (const r of results) {
      if (!reranked.find(rr => rr.fact.id === r.fact.id)) {
        reranked.push({ ...r, score: 0 });
      }
    }

    return reranked.slice(0, topK);
  } catch {
    // If re-ranking fails, return original order
    return results.slice(0, topK);
  }
}

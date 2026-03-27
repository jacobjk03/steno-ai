/**
 * Multi-query expansion — like Hydra DB's Adaptive Query Expansion.
 *
 * Takes a single query and generates 3-4 semantically diverse reformulations.
 * Each captures a different interpretation of the user's intent:
 * - Paraphrases
 * - Temporal concretizations ("last week" → "projects from March 18-25")
 * - Domain-specific restatements
 *
 * All expanded queries are searched in parallel for higher recall.
 */
export async function expandQuery(llm, query) {
    // Short queries or very specific ones don't need expansion
    if (query.length < 15 || query.split(' ').length <= 3) {
        return [query];
    }
    try {
        const response = await llm.complete([
            {
                role: 'system',
                content: `You generate search query expansions for a memory retrieval system. Given a user query, produce 3 alternative phrasings that capture different aspects of the intent.

Rules:
- Each alternative should use different keywords/phrasing
- Include temporal concretizations if relevant ("recently" → "in the past week")
- Include domain-specific restatements
- Keep each alternative concise (under 15 words)
- Return ONLY a JSON array of strings: ["query1", "query2", "query3"]`,
            },
            {
                role: 'user',
                content: query,
            },
        ], { temperature: 0.3, responseFormat: 'json' });
        const parsed = JSON.parse(response.content);
        const expansions = Array.isArray(parsed)
            ? parsed.filter((q) => typeof q === 'string' && q.trim().length > 0)
            : [];
        // Always include the original query first
        return [query, ...expansions.slice(0, 3)];
    }
    catch {
        // If expansion fails, just use the original query
        return [query];
    }
}
/**
 * Fast heuristic expansion — no LLM needed.
 * Generates simple reformulations using string manipulation.
 * Use this when you don't have an LLM available or want zero latency.
 */
export function expandQueryHeuristic(query) {
    const queries = [query];
    const lower = query.toLowerCase();
    // Add "User" prefix version if not present
    if (!lower.startsWith('user') && !lower.includes('my ') && !lower.includes('i ')) {
        queries.push(`User ${lower}`);
    }
    // Convert "my X" to "user's X"
    if (lower.includes('my ')) {
        queries.push(lower.replace(/\bmy\b/g, "user's"));
    }
    // Convert questions to statements
    if (lower.startsWith('what ') || lower.startsWith('who ') || lower.startsWith('where ') || lower.startsWith('when ')) {
        const statement = lower
            .replace(/^what (is|are|was|were) /, '')
            .replace(/^who (is|are|was|were) /, '')
            .replace(/^where (is|are|was|were|does|did) /, '')
            .replace(/^when (did|does|was|were|is) /, '')
            .replace(/\?$/, '');
        if (statement !== lower)
            queries.push(statement);
    }
    return queries.slice(0, 4);
}
//# sourceMappingURL=query-expansion.js.map
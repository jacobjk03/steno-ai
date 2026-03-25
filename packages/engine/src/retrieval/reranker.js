/**
 * Re-rank search results using embedding cosine similarity.
 * Deterministic, free (uses existing embedding model), no LLM call.
 *
 * How it works:
 * 1. Embed the query
 * 2. Embed all fact content texts in a single batch call
 * 3. Compute cosine similarity between query embedding and each fact embedding
 * 4. Blend the similarity score with the original fusion score
 * 5. Re-sort by blended score
 */
export async function rerank(embedding, query, results, topK = 10) {
    if (results.length === 0)
        return [];
    if (results.length <= 1)
        return results;
    // Embed query + all fact texts in one batch
    const texts = [query, ...results.map(r => r.fact.content)];
    const embeddings = await embedding.embedBatch(texts);
    const queryEmbedding = embeddings[0];
    const factEmbeddings = embeddings.slice(1);
    // Score each result by cosine similarity with the query
    const RERANK_WEIGHT = 0.4; // 40% embedding similarity, 60% original fusion score
    const scored = results.map((r, i) => {
        const rerankScore = cosineSimilarity(queryEmbedding, factEmbeddings[i]);
        const blendedScore = r.score * (1 - RERANK_WEIGHT) + rerankScore * RERANK_WEIGHT;
        return { ...r, score: blendedScore };
    });
    // Sort by blended score
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
}
function cosineSimilarity(a, b) {
    if (a.length !== b.length || a.length === 0)
        return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dotProduct / denom;
}
//# sourceMappingURL=reranker.js.map
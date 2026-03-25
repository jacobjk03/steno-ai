export async function vectorSearch(storage, embedding, query, tenantId, scope, scopeId, limit, asOf) {
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
        source: 'vector',
    }));
}
//# sourceMappingURL=vector-search.js.map
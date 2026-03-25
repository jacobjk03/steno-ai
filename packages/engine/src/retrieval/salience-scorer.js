/**
 * Score all candidates with recency and salience signals.
 *
 * recencyScore = pure time decay (how recently the fact was accessed)
 * salienceScore = importance x frequency factor (how important and reinforced)
 *
 * These are separate signals that feed into fusion with independent weights.
 */
export function scoreSalience(candidates, config) {
    const halfLifeDays = config?.halfLifeDays ?? 30;
    const normalizationK = config?.normalizationK ?? 50;
    return candidates.map(candidate => {
        const { fact } = candidate;
        // Recency: blend of access recency + creation recency
        // Access recency = how recently the fact was recalled (reinforcement)
        // Creation recency = how recently the fact was created (freshness)
        // Git-style versioning needs creation recency so newer versions of
        // the same lineage naturally rank higher.
        const lambda = Math.LN2 / halfLifeDays;
        const daysSinceAccess = fact.lastAccessed
            ? (Date.now() - new Date(fact.lastAccessed).getTime()) / (1000 * 60 * 60 * 24)
            : Infinity;
        const accessRecency = fact.lastAccessed ? Math.exp(-lambda * daysSinceAccess) : 0;
        const daysSinceCreation = fact.createdAt
            ? (Date.now() - new Date(fact.createdAt).getTime()) / (1000 * 60 * 60 * 24)
            : Infinity;
        const creationRecency = fact.createdAt ? Math.exp(-lambda * daysSinceCreation) : 0;
        // Blend: 50% access recency + 50% creation recency
        const recencyScore = 0.5 * accessRecency + 0.5 * creationRecency;
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
//# sourceMappingURL=salience-scorer.js.map
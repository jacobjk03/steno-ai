export function calculateDecayScore(input) {
    const { importance, frequency, lastAccessed, halfLifeDays, normalizationK } = input;
    if (lastAccessed === null)
        return 0;
    // Recency factor: exponential decay using Ebbinghaus forgetting curve
    const daysSinceAccess = (Date.now() - lastAccessed.getTime()) / (1000 * 60 * 60 * 24);
    const lambda = Math.LN2 / halfLifeDays;
    const recencyFactor = Math.exp(-lambda * daysSinceAccess);
    // Frequency factor: logarithmic scaling with fixed normalization constant K
    const frequencyFactor = Math.min(1.0, Math.log(1 + frequency) / Math.log(1 + normalizationK));
    // Final score: clamped to [0, 1]
    const score = importance * recencyFactor * frequencyFactor;
    return Math.max(0, Math.min(1, score));
}
//# sourceMappingURL=decay.js.map
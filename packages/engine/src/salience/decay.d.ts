export interface DecayInput {
    importance: number;
    frequency: number;
    lastAccessed: Date | null;
    halfLifeDays: number;
    normalizationK: number;
}
export declare function calculateDecayScore(input: DecayInput): number;
//# sourceMappingURL=decay.d.ts.map
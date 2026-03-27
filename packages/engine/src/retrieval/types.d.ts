import type { Fact, Entity, Edge } from '../models/index.js';
/** Options for the main search function */
export interface SearchOptions {
    query: string;
    tenantId: string;
    scope: string;
    scopeId: string;
    limit?: number;
    includeGraph?: boolean;
    includeHistory?: boolean;
    temporalFilter?: {
        asOf?: Date;
    };
    weights?: FusionWeights;
    tokenBudget?: number;
}
/** Configurable fusion weights (should sum to 1.0 — normalized if not) */
export interface FusionWeights {
    vector: number;
    keyword: number;
    graph: number;
    recency: number;
    salience: number;
    temporal: number;
}
/** A single search result with all signal scores */
export interface SearchResult {
    fact: Fact;
    score: number;
    signals: {
        vectorScore: number;
        keywordScore: number;
        graphScore: number;
        recencyScore: number;
        salienceScore: number;
        temporalScore: number;
    };
    triggeredBy?: string;
    contradiction?: {
        contradicts: Fact;
        status: string;
        timeline: string;
    };
    graph?: {
        entities: Entity[];
        edges: Edge[];
    };
    history?: Fact[];
}
/** Full search response */
export interface SearchResponse {
    results: SearchResult[];
    triggersMatched: string[];
    totalCandidates: number;
    durationMs: number;
}
/** Internal: candidate fact before fusion scoring */
export interface Candidate {
    fact: Fact;
    vectorScore: number;
    keywordScore: number;
    graphScore: number;
    recencyScore: number;
    salienceScore: number;
    temporalScore: number;
    source: 'vector' | 'keyword' | 'graph' | 'trigger';
    triggeredBy?: string;
}
export declare const DEFAULT_FUSION_WEIGHTS: FusionWeights;
//# sourceMappingURL=types.d.ts.map
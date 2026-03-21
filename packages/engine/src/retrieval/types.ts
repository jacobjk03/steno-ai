import type { Fact, Entity, Edge } from '../models/index.js';

/** Options for the main search function */
export interface SearchOptions {
  query: string;
  tenantId: string;
  scope: string;
  scopeId: string;
  limit?: number;              // default 10, max 100
  includeGraph?: boolean;       // include related entities/edges in results
  includeHistory?: boolean;     // include previous fact versions in results
  temporalFilter?: {
    asOf?: Date;               // point-in-time query ("what did we know on this date?")
  };
  weights?: FusionWeights;     // override default fusion weights
}

/** Configurable fusion weights (should sum to 1.0 — normalized if not) */
export interface FusionWeights {
  vector: number;    // default 0.35
  keyword: number;   // default 0.15
  graph: number;     // default 0.20
  recency: number;   // default 0.15
  salience: number;  // default 0.15
}

/** A single search result with all signal scores */
export interface SearchResult {
  fact: Fact;
  score: number;              // final fused score (0-1)
  signals: {
    vectorScore: number;
    keywordScore: number;
    graphScore: number;
    recencyScore: number;
    salienceScore: number;
  };
  triggeredBy?: string;       // trigger ID if surfaced by anticipatory retrieval
  contradiction?: {
    contradicts: Fact;
    status: string;
    timeline: string;         // human-readable description e.g. "Opinion changed over ~2 months"
  };
  graph?: {
    entities: Entity[];
    edges: Edge[];
  };
  history?: Fact[];           // previous versions of this fact (ordered by version)
}

/** Full search response */
export interface SearchResponse {
  results: SearchResult[];
  triggersMatched: string[];   // IDs of triggers that fired
  totalCandidates: number;     // total candidates before fusion/limit
  durationMs: number;
}

/** Internal: candidate fact before fusion scoring */
export interface Candidate {
  fact: Fact;
  vectorScore: number;        // 0 if not from vector search
  keywordScore: number;       // 0 if not from keyword search
  graphScore: number;         // 0 if not from graph traversal
  recencyScore: number;       // filled in by salience scorer
  salienceScore: number;      // filled in by salience scorer
  source: 'vector' | 'keyword' | 'graph' | 'trigger';
  triggeredBy?: string;       // trigger ID if from trigger matcher
}

export const DEFAULT_FUSION_WEIGHTS: FusionWeights = {
  vector: 0.35,
  keyword: 0.15,
  graph: 0.20,
  recency: 0.15,
  salience: 0.15,
};

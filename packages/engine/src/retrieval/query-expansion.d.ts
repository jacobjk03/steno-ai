import type { LLMAdapter } from '../adapters/llm.js';
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
export declare function expandQuery(llm: LLMAdapter, query: string): Promise<string[]>;
/**
 * Fast heuristic expansion — no LLM needed.
 * Generates simple reformulations using string manipulation.
 * Use this when you don't have an LLM available or want zero latency.
 */
export declare function expandQueryHeuristic(query: string): string[];
//# sourceMappingURL=query-expansion.d.ts.map
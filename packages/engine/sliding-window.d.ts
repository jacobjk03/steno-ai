/**
 * Sliding Window Inference Pipeline — like Hydra DB's context-enriched chunking.
 *
 * Splits long text into segments with overlapping context windows.
 * Each segment gets surrounding context (lookback + lookahead) so the LLM can:
 * - Resolve pronouns ("he" → "John")
 * - Resolve references ("that framework" → "React")
 * - Understand temporal context from earlier messages
 *
 * This prevents the "Orphaned Pronoun Paradox" where isolated chunks lose meaning.
 */
export interface WindowConfig {
    /** Characters per segment (default: 800) */
    segmentSize?: number;
    /** Number of lookback segments for context (default: 2) */
    hPrev?: number;
    /** Number of lookahead segments for context (default: 1) */
    hNext?: number;
    /** Only apply windowing for inputs longer than this (default: 1500) */
    minInputLength?: number;
    /** Maximum segments to process (default: 8, to cap LLM costs) */
    maxSegments?: number;
}
export interface EnrichedSegment {
    /** The primary segment text */
    segment: string;
    /** Full context window with markers */
    contextWindow: string;
    /** Segment index */
    index: number;
    /** Total segments */
    total: number;
}
/**
 * Create enriched segments with sliding window context.
 *
 * For each segment, includes surrounding context so the LLM can resolve
 * references and understand temporal relationships.
 */
export declare function createEnrichedSegments(text: string, config?: WindowConfig): EnrichedSegment[];

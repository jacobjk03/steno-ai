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

const DEFAULT_CONFIG: Required<WindowConfig> = {
  segmentSize: 800,
  hPrev: 2,
  hNext: 1,
  minInputLength: 1500,
  maxSegments: 8,
};

/**
 * Split text into segments at sentence boundaries.
 */
function splitIntoSegments(text: string, segmentSize: number): string[] {
  const segments: string[] = [];
  let current = '';

  // Split by sentences (period/exclamation/question followed by space or newline)
  const sentences = text.split(/(?<=[.!?])\s+/);

  for (const sentence of sentences) {
    if (current.length + sentence.length > segmentSize && current.length > 0) {
      segments.push(current.trim());
      current = sentence;
    } else {
      current += (current ? ' ' : '') + sentence;
    }
  }
  if (current.trim()) segments.push(current.trim());

  return segments;
}

/**
 * Create enriched segments with sliding window context.
 *
 * For each segment, includes surrounding context so the LLM can resolve
 * references and understand temporal relationships.
 */
export function createEnrichedSegments(
  text: string,
  config?: WindowConfig,
): EnrichedSegment[] {
  const c = { ...DEFAULT_CONFIG, ...config };

  // Short inputs don't need windowing
  if (text.length < c.minInputLength) {
    return [{
      segment: text,
      contextWindow: text,
      index: 0,
      total: 1,
    }];
  }

  const segments = splitIntoSegments(text, c.segmentSize);

  // Cap segments to avoid excessive LLM calls
  const effectiveSegments = segments.length > c.maxSegments
    ? segments.slice(0, c.maxSegments)
    : segments;

  return effectiveSegments.map((seg, i) => {
    // Build context window with lookback and lookahead
    const prevStart = Math.max(0, i - c.hPrev);
    const nextEnd = Math.min(segments.length - 1, i + c.hNext);

    const contextBefore = segments.slice(prevStart, i).join('\n');
    const contextAfter = segments.slice(i + 1, nextEnd + 1).join('\n');

    let contextWindow = '';
    if (contextBefore) {
      contextWindow += `[PRECEDING CONTEXT — use this to resolve pronouns, references, and temporal expressions in the current segment]\n${contextBefore}\n\n`;
    }
    contextWindow += `[CURRENT SEGMENT — extract facts from this]\n${seg}`;
    if (contextAfter) {
      contextWindow += `\n\n[FOLLOWING CONTEXT]\n${contextAfter}`;
    }

    return {
      segment: seg,
      contextWindow,
      index: i,
      total: effectiveSegments.length,
    };
  });
}

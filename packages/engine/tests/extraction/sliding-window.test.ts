import { describe, it, expect } from 'vitest';
import { createEnrichedSegments } from '../../src/extraction/sliding-window.js';

/** Helper: generate a string of approximately `n` characters with sentence boundaries. */
function makeText(n: number): string {
  const sentence = 'The quick brown fox jumps over the lazy dog. '; // 46 chars
  const repeats = Math.ceil(n / sentence.length);
  return sentence.repeat(repeats).slice(0, n);
}

describe('createEnrichedSegments', () => {
  it('returns a single segment for short input (below 3500 chars)', () => {
    const text = makeText(3000);
    const segments = createEnrichedSegments(text);
    expect(segments).toHaveLength(1);
    expect(segments[0].index).toBe(0);
    expect(segments[0].total).toBe(1);
    expect(segments[0].contextWindow).toBe(segments[0].segment);
  });

  it('windows input at exactly the threshold boundary', () => {
    const text = makeText(3500);
    // At exactly 3500, text.length < 3500 is false, so windowing applies
    const segments = createEnrichedSegments(text);
    expect(segments.length).toBeGreaterThan(1);
  });

  it('windows a 5000-char input into multiple segments', () => {
    const text = makeText(5000);
    const segments = createEnrichedSegments(text);
    expect(segments.length).toBeGreaterThan(1);
    // Each segment should have proper index/total metadata
    for (let i = 0; i < segments.length; i++) {
      expect(segments[i].index).toBe(i);
      expect(segments[i].total).toBe(segments.length);
    }
  });

  it('caps segments at maxSegments=6 for very long input', () => {
    const text = makeText(20000);
    const segments = createEnrichedSegments(text);
    expect(segments.length).toBeLessThanOrEqual(6);
  });

  it('respects a custom maxSegments override', () => {
    const text = makeText(20000);
    const segments = createEnrichedSegments(text, { maxSegments: 3 });
    expect(segments.length).toBeLessThanOrEqual(3);
  });

  it('respects a custom minInputLength override', () => {
    const text = makeText(5000);
    // With a high threshold, should return single segment
    const segments = createEnrichedSegments(text, { minInputLength: 10000 });
    expect(segments).toHaveLength(1);
  });

  it('includes PRECEDING CONTEXT marker for non-first segments', () => {
    const text = makeText(5000);
    const segments = createEnrichedSegments(text);
    expect(segments.length).toBeGreaterThan(1);
    // First segment should not have preceding context
    expect(segments[0].contextWindow).not.toContain('[PRECEDING CONTEXT');
    // Second segment should have preceding context
    expect(segments[1].contextWindow).toContain('[PRECEDING CONTEXT');
  });

  it('includes CURRENT SEGMENT marker in every context window', () => {
    const text = makeText(5000);
    const segments = createEnrichedSegments(text);
    for (const seg of segments) {
      expect(seg.contextWindow).toContain('[CURRENT SEGMENT');
    }
  });
});

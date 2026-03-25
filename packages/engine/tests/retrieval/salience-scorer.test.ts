import { describe, it, expect } from 'vitest';
import { scoreSalience } from '../../src/retrieval/salience-scorer.js';
import type { Candidate } from '../../src/retrieval/types.js';
import type { Fact } from '../../src/models/index.js';

function msAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function makeFact(overrides: Partial<Fact> = {}): Fact {
  return {
    id: 'fact-1',
    tenantId: 'tenant-1',
    scope: 'user',
    scopeId: 'user-1',
    sessionId: null,
    content: 'likes TypeScript',
    embeddingModel: 'text-embedding-3-small',
    embeddingDim: 1536,
    version: 1,
    lineageId: 'lineage-1',
    validFrom: new Date('2025-01-01'),
    validUntil: null,
    operation: 'create',
    parentId: null,
    importance: 0.8,
    frequency: 5,
    lastAccessed: new Date('2025-06-01'),
    decayScore: 0.9,
    contradictionStatus: 'none',
    contradictsId: null,
    sourceType: 'conversation',
    sourceRef: null,
    confidence: 0.9,
    originalContent: null,
    extractionId: null,
    extractionTier: null,
    modality: 'text',
    tags: [],
    metadata: {},
    createdAt: new Date(),
    ...overrides,
  };
}

function makeCandidate(factOverrides: Partial<Fact> = {}, candidateOverrides: Partial<Candidate> = {}): Candidate {
  return {
    fact: makeFact(factOverrides),
    vectorScore: 0.85,
    keywordScore: 0.5,
    graphScore: 0.3,
    recencyScore: 0,
    salienceScore: 0,
    source: 'vector',
    ...candidateOverrides,
  };
}

describe('scoreSalience', () => {
  describe('recencyScore', () => {
    it('recently accessed fact gets high recencyScore (~1.0)', () => {
      const candidate = makeCandidate({ lastAccessed: msAgo(0) });
      const [scored] = scoreSalience([candidate]);

      expect(scored.recencyScore).toBeGreaterThan(0.99);
      expect(scored.recencyScore).toBeLessThanOrEqual(1);
    });

    it('fact accessed 1 day ago still gets high recencyScore', () => {
      const candidate = makeCandidate({ lastAccessed: msAgo(1) });
      const [scored] = scoreSalience([candidate]);

      expect(scored.recencyScore).toBeGreaterThan(0.95);
      expect(scored.recencyScore).toBeLessThanOrEqual(1);
    });

    it('old fact (60+ days access) gets lower recencyScore but boosted by creation freshness', () => {
      const candidate = makeCandidate({ lastAccessed: msAgo(60) });
      const [scored] = scoreSalience([candidate]);

      // Blended: 50% access recency (~0.25 after 2 half-lives) + 50% creation recency (~1.0)
      // So ~0.625 — lower than fresh but not zero thanks to creation freshness
      expect(scored.recencyScore).toBeLessThan(0.7);
      expect(scored.recencyScore).toBeGreaterThan(0.5);
    });

    it('never-accessed fact still has creation recency', () => {
      const candidate = makeCandidate({ lastAccessed: null });
      const [scored] = scoreSalience([candidate]);

      // access=0, creation≈1.0, blended = ~0.5
      expect(scored.recencyScore).toBeCloseTo(0.5, 1);
    });

    it('recencyScore at halfLifeDays access is ~0.75 (blended with creation)', () => {
      const candidate = makeCandidate({ lastAccessed: msAgo(30) });
      const [scored] = scoreSalience([candidate]);

      // access≈0.5 at halfLife, creation≈1.0, blended = ~0.75
      expect(scored.recencyScore).toBeCloseTo(0.75, 1);
    });

    it('more recent fact scores higher than older fact', () => {
      const recent = makeCandidate({ lastAccessed: msAgo(5) });
      const old = makeCandidate({ lastAccessed: msAgo(90) });
      const [scoredRecent, scoredOld] = scoreSalience([recent, old]);

      expect(scoredRecent.recencyScore).toBeGreaterThan(scoredOld.recencyScore);
    });
  });

  describe('salienceScore', () => {
    it('high importance and high frequency = high salienceScore', () => {
      const candidate = makeCandidate({ importance: 1.0, frequency: 100 });
      const [scored] = scoreSalience([candidate]);

      expect(scored.salienceScore).toBeGreaterThan(0.8);
      expect(scored.salienceScore).toBeLessThanOrEqual(1);
    });

    it('low importance = low salienceScore regardless of frequency', () => {
      const candidate = makeCandidate({ importance: 0.1, frequency: 100 });
      const [scored] = scoreSalience([candidate]);

      expect(scored.salienceScore).toBeLessThan(0.15);
    });

    it('zero frequency yields salienceScore close to 0', () => {
      const candidate = makeCandidate({ importance: 1.0, frequency: 0 });
      const [scored] = scoreSalience([candidate]);

      // log(1+0) / log(1+50) = 0, so salience = importance * 0 = 0
      expect(scored.salienceScore).toBe(0);
    });

    it('higher frequency increases salienceScore', () => {
      const lowFreq = makeCandidate({ importance: 0.8, frequency: 1 });
      const highFreq = makeCandidate({ importance: 0.8, frequency: 50 });
      const [scoredLow, scoredHigh] = scoreSalience([lowFreq, highFreq]);

      expect(scoredHigh.salienceScore).toBeGreaterThan(scoredLow.salienceScore);
    });

    it('frequency factor caps at 1.0 even with very high frequency', () => {
      const highFreq = makeCandidate({ importance: 1.0, frequency: 1000 });
      const veryHighFreq = makeCandidate({ importance: 1.0, frequency: 10000 });
      const [scored1, scored2] = scoreSalience([highFreq, veryHighFreq]);

      // Both should be capped to 1.0 (importance * 1.0)
      expect(scored1.salienceScore).toBeLessThanOrEqual(1);
      expect(scored2.salienceScore).toBeLessThanOrEqual(1);
      expect(Math.abs(scored1.salienceScore - scored2.salienceScore)).toBeLessThan(0.01);
    });
  });

  describe('clamping', () => {
    it('scores are clamped to [0, 1]', () => {
      const candidates = [
        makeCandidate({ lastAccessed: msAgo(0), importance: 1.0, frequency: 10000 }),
        makeCandidate({ lastAccessed: null, importance: 0, frequency: 0 }),
        makeCandidate({ lastAccessed: msAgo(365), importance: 0.5, frequency: 5 }),
      ];
      const scored = scoreSalience(candidates);

      for (const c of scored) {
        expect(c.recencyScore).toBeGreaterThanOrEqual(0);
        expect(c.recencyScore).toBeLessThanOrEqual(1);
        expect(c.salienceScore).toBeGreaterThanOrEqual(0);
        expect(c.salienceScore).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('config overrides', () => {
    it('custom halfLifeDays changes recency decay rate', () => {
      const candidate = makeCandidate({ lastAccessed: msAgo(30) });

      // With blended formula (50% access + 50% creation):
      // Default half-life 30: access≈0.5, creation≈1.0, blended≈0.75
      const [defaultScored] = scoreSalience([candidate]);
      expect(defaultScored.recencyScore).toBeCloseTo(0.75, 1);

      // Shorter half-life 10: access≈0.125 (3 half-lives), creation≈1.0, blended≈0.5625
      const [shortLife] = scoreSalience([candidate], { halfLifeDays: 10 });
      expect(shortLife.recencyScore).toBeLessThan(defaultScored.recencyScore);

      // Longer half-life 60: access≈0.707, creation≈1.0, blended≈0.854
      const [longLife] = scoreSalience([candidate], { halfLifeDays: 60 });
      expect(longLife.recencyScore).toBeGreaterThan(defaultScored.recencyScore);
    });

    it('custom normalizationK changes frequency scaling', () => {
      const candidate = makeCandidate({ importance: 1.0, frequency: 10 });

      // Default K=50: log(11)/log(51) ~ 0.61
      const [defaultScored] = scoreSalience([candidate]);

      // Small K=5: log(11)/log(6) ~ 1.0 (capped)
      const [smallK] = scoreSalience([candidate], { normalizationK: 5 });

      // Large K=500: log(11)/log(501) ~ 0.39
      const [largeK] = scoreSalience([candidate], { normalizationK: 500 });

      expect(smallK.salienceScore).toBeGreaterThan(defaultScored.salienceScore);
      expect(defaultScored.salienceScore).toBeGreaterThan(largeK.salienceScore);
    });
  });

  describe('candidate integrity', () => {
    it('multiple candidates are scored independently', () => {
      const c1 = makeCandidate(
        { lastAccessed: msAgo(1), importance: 0.9, frequency: 20 },
        { vectorScore: 0.95 },
      );
      const c2 = makeCandidate(
        { lastAccessed: msAgo(90), importance: 0.2, frequency: 1 },
        { vectorScore: 0.4 },
      );
      const scored = scoreSalience([c1, c2]);

      expect(scored).toHaveLength(2);
      // First candidate should have higher scores than second
      expect(scored[0].recencyScore).toBeGreaterThan(scored[1].recencyScore);
      expect(scored[0].salienceScore).toBeGreaterThan(scored[1].salienceScore);
    });

    it('original candidate fields (vectorScore, etc.) are preserved', () => {
      const candidate = makeCandidate(
        { lastAccessed: msAgo(5) },
        {
          vectorScore: 0.92,
          keywordScore: 0.65,
          graphScore: 0.4,
          source: 'keyword',
          triggeredBy: 'trigger-abc',
        },
      );
      const [scored] = scoreSalience([candidate]);

      expect(scored.vectorScore).toBe(0.92);
      expect(scored.keywordScore).toBe(0.65);
      expect(scored.graphScore).toBe(0.4);
      expect(scored.source).toBe('keyword');
      expect(scored.triggeredBy).toBe('trigger-abc');
      expect(scored.fact).toBe(candidate.fact);
    });

    it('empty candidates returns empty result', () => {
      const scored = scoreSalience([]);
      expect(scored).toEqual([]);
    });
  });
});

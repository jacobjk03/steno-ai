import { describe, it, expect } from 'vitest';
import { fuseAndRank } from '../../src/retrieval/fusion.js';
import { DEFAULT_FUSION_WEIGHTS } from '../../src/retrieval/types.js';
import type { FusionWeights, Candidate } from '../../src/retrieval/types.js';
import type { Fact } from '../../src/models/index.js';

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
    createdAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function makeCandidate(
  factOverrides: Partial<Fact> = {},
  candidateOverrides: Partial<Candidate> = {},
): Candidate {
  return {
    fact: makeFact(factOverrides),
    vectorScore: 0,
    keywordScore: 0,
    graphScore: 0,
    recencyScore: 0,
    salienceScore: 0,
    source: 'vector',
    ...candidateOverrides,
  };
}

describe('fuseAndRank', () => {
  describe('empty input', () => {
    it('empty candidates returns empty results', () => {
      const results = fuseAndRank([], DEFAULT_FUSION_WEIGHTS, 10);
      expect(results).toEqual([]);
    });
  });

  describe('single candidate', () => {
    it('single candidate returns single result with correct weighted score', () => {
      const candidate = makeCandidate(
        { id: 'fact-single' },
        {
          vectorScore: 0.9,
          keywordScore: 0.5,
          graphScore: 0.3,
          recencyScore: 0.7,
          salienceScore: 0.6,
          source: 'vector',
        },
      );

      const results = fuseAndRank([candidate], DEFAULT_FUSION_WEIGHTS, 10);

      expect(results).toHaveLength(1);
      const expected =
        0.9 * 0.35 +
        0.5 * 0.15 +
        0.3 * 0.2 +
        0.7 * 0.15 +
        0.6 * 0.15;
      expect(results[0].score).toBeCloseTo(expected, 10);
      expect(results[0].fact.id).toBe('fact-single');
    });
  });

  describe('DEFAULT_FUSION_WEIGHTS', () => {
    it('default weights sum to 1.0', () => {
      const sum =
        DEFAULT_FUSION_WEIGHTS.vector +
        DEFAULT_FUSION_WEIGHTS.keyword +
        DEFAULT_FUSION_WEIGHTS.graph +
        DEFAULT_FUSION_WEIGHTS.recency +
        DEFAULT_FUSION_WEIGHTS.salience;
      expect(sum).toBeCloseTo(1.0, 10);
    });
  });

  describe('weight normalization', () => {
    it('custom weights are normalized if they do not sum to 1.0', () => {
      const weights: FusionWeights = {
        vector: 2,
        keyword: 2,
        graph: 2,
        recency: 2,
        salience: 2,
      };
      // Sum = 10, so each normalized weight = 0.2
      const candidate = makeCandidate(
        { id: 'fact-norm' },
        {
          vectorScore: 1.0,
          keywordScore: 0.0,
          graphScore: 0.0,
          recencyScore: 0.0,
          salienceScore: 0.0,
          source: 'vector',
        },
      );

      const results = fuseAndRank([candidate], weights, 10);

      // Only vector contributes: 1.0 * 0.2 = 0.2
      expect(results[0].score).toBeCloseTo(0.2, 10);
    });

    it('all-zero weights fallback to equal distribution (0.2 each)', () => {
      const weights: FusionWeights = {
        vector: 0,
        keyword: 0,
        graph: 0,
        recency: 0,
        salience: 0,
      };
      const candidate = makeCandidate(
        { id: 'fact-zero' },
        {
          vectorScore: 1.0,
          keywordScore: 0.5,
          graphScore: 0.0,
          recencyScore: 0.0,
          salienceScore: 0.0,
          source: 'vector',
        },
      );

      const results = fuseAndRank([candidate], weights, 10);

      // Equal weights: 1.0*0.2 + 0.5*0.2 + 0*0.2 + 0*0.2 + 0*0.2 = 0.3
      expect(results[0].score).toBeCloseTo(0.3, 10);
    });
  });

  describe('deduplication', () => {
    it('deduplicates facts by ID and keeps highest score per signal', () => {
      const c1 = makeCandidate(
        { id: 'fact-dup' },
        {
          vectorScore: 0.9,
          keywordScore: 0.1,
          graphScore: 0.0,
          recencyScore: 0.5,
          salienceScore: 0.3,
          source: 'vector',
        },
      );
      const c2 = makeCandidate(
        { id: 'fact-dup' },
        {
          vectorScore: 0.4,
          keywordScore: 0.8,
          graphScore: 0.6,
          recencyScore: 0.2,
          salienceScore: 0.7,
          source: 'keyword',
        },
      );

      const results = fuseAndRank([c1, c2], DEFAULT_FUSION_WEIGHTS, 10);

      expect(results).toHaveLength(1);
      // Should keep max of each signal
      expect(results[0].signals.vectorScore).toBe(0.9);
      expect(results[0].signals.keywordScore).toBe(0.8);
      expect(results[0].signals.graphScore).toBe(0.6);
      expect(results[0].signals.recencyScore).toBe(0.5);
      expect(results[0].signals.salienceScore).toBe(0.7);
    });

    it('when same fact appears from vector AND keyword, both scores are preserved', () => {
      const fromVector = makeCandidate(
        { id: 'fact-multi' },
        {
          vectorScore: 0.85,
          keywordScore: 0.0,
          graphScore: 0.0,
          recencyScore: 0.0,
          salienceScore: 0.0,
          source: 'vector',
        },
      );
      const fromKeyword = makeCandidate(
        { id: 'fact-multi' },
        {
          vectorScore: 0.0,
          keywordScore: 0.72,
          graphScore: 0.0,
          recencyScore: 0.0,
          salienceScore: 0.0,
          source: 'keyword',
        },
      );

      const results = fuseAndRank([fromVector, fromKeyword], DEFAULT_FUSION_WEIGHTS, 10);

      expect(results).toHaveLength(1);
      expect(results[0].signals.vectorScore).toBe(0.85);
      expect(results[0].signals.keywordScore).toBe(0.72);
    });
  });

  describe('scoring', () => {
    it('final score equals weighted sum of all signal scores', () => {
      const weights: FusionWeights = {
        vector: 0.4,
        keyword: 0.2,
        graph: 0.1,
        recency: 0.2,
        salience: 0.1,
      };
      const candidate = makeCandidate(
        { id: 'fact-ws' },
        {
          vectorScore: 0.8,
          keywordScore: 0.6,
          graphScore: 0.4,
          recencyScore: 0.5,
          salienceScore: 0.3,
          source: 'vector',
        },
      );

      const results = fuseAndRank([candidate], weights, 10);

      const expected =
        0.8 * 0.4 +
        0.6 * 0.2 +
        0.4 * 0.1 +
        0.5 * 0.2 +
        0.3 * 0.1;
      expect(results[0].score).toBeCloseTo(expected, 10);
    });
  });

  describe('sorting', () => {
    it('results sorted by score descending', () => {
      const c1 = makeCandidate(
        { id: 'fact-low' },
        { vectorScore: 0.1, source: 'vector' },
      );
      const c2 = makeCandidate(
        { id: 'fact-high' },
        { vectorScore: 0.9, source: 'vector' },
      );
      const c3 = makeCandidate(
        { id: 'fact-mid' },
        { vectorScore: 0.5, source: 'vector' },
      );

      const results = fuseAndRank([c1, c2, c3], DEFAULT_FUSION_WEIGHTS, 10);

      expect(results).toHaveLength(3);
      expect(results[0].fact.id).toBe('fact-high');
      expect(results[1].fact.id).toBe('fact-mid');
      expect(results[2].fact.id).toBe('fact-low');
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
      expect(results[1].score).toBeGreaterThanOrEqual(results[2].score);
    });
  });

  describe('limit', () => {
    it('limit caps output size (10 candidates, limit=3 returns 3 results)', () => {
      const candidates: Candidate[] = [];
      for (let i = 0; i < 10; i++) {
        candidates.push(
          makeCandidate(
            { id: `fact-${i}` },
            { vectorScore: i / 10, source: 'vector' },
          ),
        );
      }

      const results = fuseAndRank(candidates, DEFAULT_FUSION_WEIGHTS, 3);

      expect(results).toHaveLength(3);
      // Top 3 by score (highest vectorScore)
      expect(results[0].fact.id).toBe('fact-9');
      expect(results[1].fact.id).toBe('fact-8');
      expect(results[2].fact.id).toBe('fact-7');
    });
  });

  describe('signal transparency', () => {
    it('signal scores preserved in output for transparency', () => {
      const candidate = makeCandidate(
        { id: 'fact-signals' },
        {
          vectorScore: 0.88,
          keywordScore: 0.55,
          graphScore: 0.42,
          recencyScore: 0.73,
          salienceScore: 0.61,
          source: 'graph',
        },
      );

      const results = fuseAndRank([candidate], DEFAULT_FUSION_WEIGHTS, 10);

      expect(results[0].signals).toEqual({
        vectorScore: 0.88,
        keywordScore: 0.55,
        graphScore: 0.42,
        recencyScore: 0.73,
        salienceScore: 0.61,
      });
    });
  });

  describe('metadata fields', () => {
    it('triggeredBy is preserved from trigger candidates', () => {
      const candidate = makeCandidate(
        { id: 'fact-trig' },
        {
          vectorScore: 0.7,
          source: 'trigger',
          triggeredBy: 'trigger-xyz',
        },
      );

      const results = fuseAndRank([candidate], DEFAULT_FUSION_WEIGHTS, 10);

      expect(results[0].triggeredBy).toBe('trigger-xyz');
    });

    it('triggeredBy is preserved when deduplicating and one candidate has it', () => {
      const c1 = makeCandidate(
        { id: 'fact-trig2' },
        { vectorScore: 0.7, source: 'vector' },
      );
      const c2 = makeCandidate(
        { id: 'fact-trig2' },
        { vectorScore: 0.5, source: 'trigger', triggeredBy: 'trigger-abc' },
      );

      const results = fuseAndRank([c1, c2], DEFAULT_FUSION_WEIGHTS, 10);

      expect(results).toHaveLength(1);
      expect(results[0].triggeredBy).toBe('trigger-abc');
    });

    it('source field shows which signal first surfaced the candidate', () => {
      const candidate = makeCandidate(
        { id: 'fact-src' },
        { vectorScore: 0.7, source: 'keyword' },
      );

      const results = fuseAndRank([candidate], DEFAULT_FUSION_WEIGHTS, 10);

      expect(results[0].source).toBe('keyword');
    });
  });

  describe('numerical precision', () => {
    it('scores are reasonable floats between 0 and 1', () => {
      const candidates: Candidate[] = [];
      for (let i = 0; i < 20; i++) {
        candidates.push(
          makeCandidate(
            { id: `fact-prec-${i}` },
            {
              vectorScore: Math.random(),
              keywordScore: Math.random(),
              graphScore: Math.random(),
              recencyScore: Math.random(),
              salienceScore: Math.random(),
              source: 'vector',
            },
          ),
        );
      }

      const results = fuseAndRank(candidates, DEFAULT_FUSION_WEIGHTS, 20);

      for (const r of results) {
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(1);
        expect(Number.isFinite(r.score)).toBe(true);
        expect(Number.isNaN(r.score)).toBe(false);
      }
    });

    it('all signal scores in [0,1] produce a fused score in [0,1]', () => {
      // All signals at max
      const maxCandidate = makeCandidate(
        { id: 'fact-max' },
        {
          vectorScore: 1.0,
          keywordScore: 1.0,
          graphScore: 1.0,
          recencyScore: 1.0,
          salienceScore: 1.0,
          source: 'vector',
        },
      );

      // All signals at min
      const minCandidate = makeCandidate(
        { id: 'fact-min' },
        {
          vectorScore: 0.0,
          keywordScore: 0.0,
          graphScore: 0.0,
          recencyScore: 0.0,
          salienceScore: 0.0,
          source: 'vector',
        },
      );

      const results = fuseAndRank([maxCandidate, minCandidate], DEFAULT_FUSION_WEIGHTS, 10);

      expect(results[0].score).toBeCloseTo(1.0, 10);
      expect(results[1].score).toBeCloseTo(0.0, 10);
    });
  });
});

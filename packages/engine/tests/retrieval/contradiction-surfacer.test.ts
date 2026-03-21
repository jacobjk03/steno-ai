import { describe, it, expect, vi } from 'vitest';
import { surfaceContradictions, buildTimeline } from '../../src/retrieval/contradiction-surfacer.js';
import type { StorageAdapter } from '../../src/adapters/storage.js';
import type { FusionResult } from '../../src/retrieval/fusion.js';
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

function makeFusionResult(
  factOverrides: Partial<Fact> = {},
  fusionOverrides: Partial<FusionResult> = {},
): FusionResult {
  return {
    fact: makeFact(factOverrides),
    score: 0.75,
    signals: {
      vectorScore: 0.8,
      keywordScore: 0.5,
      graphScore: 0.3,
      recencyScore: 0.7,
      salienceScore: 0.6,
    },
    source: 'vector',
    ...fusionOverrides,
  };
}

function mockStorage(getFact: StorageAdapter['getFact']): StorageAdapter {
  return {
    getFact,
  } as unknown as StorageAdapter;
}

describe('surfaceContradictions', () => {
  it('fact with contradictionStatus="none" has no contradiction field', async () => {
    const storage = mockStorage(vi.fn());
    const results = [makeFusionResult({ contradictionStatus: 'none', contradictsId: null })];

    const enriched = await surfaceContradictions(storage, 'tenant-1', results);

    expect(enriched).toHaveLength(1);
    expect(enriched[0].contradiction).toBeUndefined();
    expect((storage.getFact as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('fact with contradictionStatus="active" and contradictsId fetches contradicted fact and builds timeline', async () => {
    const oldFact = makeFact({
      id: 'old-fact',
      content: 'prefers Python',
      validFrom: new Date('2025-01-01'),
      validUntil: new Date('2025-03-01'),
    });

    const storage = mockStorage(vi.fn().mockResolvedValue(oldFact));

    const results = [
      makeFusionResult({
        id: 'new-fact',
        content: 'prefers TypeScript',
        contradictionStatus: 'active',
        contradictsId: 'old-fact',
        validFrom: new Date('2025-03-01'),
      }),
    ];

    const enriched = await surfaceContradictions(storage, 'tenant-1', results);

    expect(enriched).toHaveLength(1);
    expect(enriched[0].contradiction).toBeDefined();
    expect(enriched[0].contradiction!.contradicts.id).toBe('old-fact');
    expect(enriched[0].contradiction!.status).toBe('active');
    expect(enriched[0].contradiction!.timeline).toBe('Changed over ~2 months');
    expect((storage.getFact as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('tenant-1', 'old-fact');
  });

  it('fact with contradictionStatus="superseded" includes superseded context', async () => {
    const oldFact = makeFact({
      id: 'old-fact',
      content: 'lives in NYC',
      validFrom: new Date('2024-06-01'),
      validUntil: new Date('2025-06-01'),
    });

    const storage = mockStorage(vi.fn().mockResolvedValue(oldFact));

    const results = [
      makeFusionResult({
        id: 'new-fact',
        content: 'lives in SF',
        contradictionStatus: 'superseded',
        contradictsId: 'old-fact',
        validFrom: new Date('2025-06-01'),
      }),
    ];

    const enriched = await surfaceContradictions(storage, 'tenant-1', results);

    expect(enriched).toHaveLength(1);
    expect(enriched[0].contradiction).toBeDefined();
    expect(enriched[0].contradiction!.status).toBe('superseded');
    expect(enriched[0].contradiction!.contradicts.id).toBe('old-fact');
    expect(enriched[0].contradiction!.timeline).toBe('Changed over ~1 year');
  });

  it('fact with contradictsId but contradicted fact deleted (getFact returns null) has no contradiction field', async () => {
    const storage = mockStorage(vi.fn().mockResolvedValue(null));

    const results = [
      makeFusionResult({
        id: 'new-fact',
        contradictionStatus: 'active',
        contradictsId: 'deleted-fact',
        validFrom: new Date('2025-03-01'),
      }),
    ];

    const enriched = await surfaceContradictions(storage, 'tenant-1', results);

    expect(enriched).toHaveLength(1);
    expect(enriched[0].contradiction).toBeUndefined();
    expect((storage.getFact as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('tenant-1', 'deleted-fact');
  });

  it('fact with contradictionStatus="active" but null contradictsId has no contradiction field', async () => {
    const storage = mockStorage(vi.fn());

    const results = [
      makeFusionResult({
        contradictionStatus: 'active',
        contradictsId: null,
      }),
    ];

    const enriched = await surfaceContradictions(storage, 'tenant-1', results);

    expect(enriched).toHaveLength(1);
    expect(enriched[0].contradiction).toBeUndefined();
    expect((storage.getFact as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('preserves all other SearchResult fields (score, signals, triggeredBy)', async () => {
    const storage = mockStorage(vi.fn());

    const results = [
      makeFusionResult(
        { contradictionStatus: 'none', contradictsId: null },
        {
          score: 0.92,
          signals: {
            vectorScore: 0.95,
            keywordScore: 0.88,
            graphScore: 0.72,
            recencyScore: 0.81,
            salienceScore: 0.67,
          },
          triggeredBy: 'trigger-abc',
        },
      ),
    ];

    const enriched = await surfaceContradictions(storage, 'tenant-1', results);

    expect(enriched).toHaveLength(1);
    expect(enriched[0].score).toBe(0.92);
    expect(enriched[0].signals).toEqual({
      vectorScore: 0.95,
      keywordScore: 0.88,
      graphScore: 0.72,
      recencyScore: 0.81,
      salienceScore: 0.67,
    });
    expect(enriched[0].triggeredBy).toBe('trigger-abc');
    expect(enriched[0].fact).toBe(results[0].fact);
  });

  it('multiple results are each processed independently', async () => {
    const oldFact = makeFact({
      id: 'old-fact',
      validFrom: new Date('2025-01-01'),
      validUntil: new Date('2025-02-01'),
    });

    const getFact = vi.fn().mockImplementation((_tenantId: string, id: string) => {
      if (id === 'old-fact') return Promise.resolve(oldFact);
      return Promise.resolve(null);
    });
    const storage = mockStorage(getFact);

    const results = [
      makeFusionResult({
        id: 'fact-no-contradiction',
        contradictionStatus: 'none',
        contradictsId: null,
      }),
      makeFusionResult({
        id: 'fact-with-contradiction',
        contradictionStatus: 'active',
        contradictsId: 'old-fact',
        validFrom: new Date('2025-02-01'),
      }),
      makeFusionResult({
        id: 'fact-deleted-reference',
        contradictionStatus: 'active',
        contradictsId: 'gone-fact',
        validFrom: new Date('2025-03-01'),
      }),
    ];

    const enriched = await surfaceContradictions(storage, 'tenant-1', results);

    expect(enriched).toHaveLength(3);

    // First: no contradiction
    expect(enriched[0].contradiction).toBeUndefined();
    expect(enriched[0].fact.id).toBe('fact-no-contradiction');

    // Second: has contradiction
    expect(enriched[1].contradiction).toBeDefined();
    expect(enriched[1].contradiction!.contradicts.id).toBe('old-fact');
    expect(enriched[1].contradiction!.status).toBe('active');
    expect(enriched[1].fact.id).toBe('fact-with-contradiction');

    // Third: contradicted fact deleted
    expect(enriched[2].contradiction).toBeUndefined();
    expect(enriched[2].fact.id).toBe('fact-deleted-reference');

    expect(getFact).toHaveBeenCalledTimes(2);
  });
});

describe('buildTimeline', () => {
  it('same day returns "Superseded on the same day"', () => {
    const result = buildTimeline(
      new Date('2025-06-15'),
      null,
      new Date('2025-06-15'),
    );
    expect(result).toBe('Superseded on the same day');
  });

  it('1 day apart returns "Updated after 1 day"', () => {
    const result = buildTimeline(
      new Date('2025-06-15'),
      null,
      new Date('2025-06-16'),
    );
    expect(result).toBe('Updated after 1 day');
  });

  it('5 days apart returns "Updated after 5 days"', () => {
    const result = buildTimeline(
      new Date('2025-06-10'),
      null,
      new Date('2025-06-15'),
    );
    expect(result).toBe('Updated after 5 days');
  });

  it('10 days apart returns "Changed over ~1 week"', () => {
    const result = buildTimeline(
      new Date('2025-06-01'),
      null,
      new Date('2025-06-11'),
    );
    expect(result).toBe('Changed over ~1 week');
  });

  it('45 days apart returns "Changed over ~2 months"', () => {
    const result = buildTimeline(
      new Date('2025-01-01'),
      null,
      new Date('2025-02-15'),
    );
    expect(result).toBe('Changed over ~2 months');
  });

  it('400 days apart returns "Changed over ~1 year"', () => {
    const result = buildTimeline(
      new Date('2024-01-01'),
      null,
      new Date('2025-02-05'),
    );
    expect(result).toBe('Changed over ~1 year');
  });

  it('uses absolute difference (handles reversed dates)', () => {
    const result = buildTimeline(
      new Date('2025-06-15'),
      null,
      new Date('2025-06-10'),
    );
    expect(result).toBe('Updated after 5 days');
  });

  it('accepts oldValidUntil without affecting result', () => {
    const result = buildTimeline(
      new Date('2025-06-10'),
      new Date('2025-07-01'),
      new Date('2025-06-15'),
    );
    expect(result).toBe('Updated after 5 days');
  });
});

import { describe, it, expect } from 'vitest';
import { extractTimeReference, scoreTemporalRelevance } from '../../src/retrieval/temporal-scorer.js';
import type { Candidate } from '../../src/retrieval/types.js';
import type { Fact } from '../../src/models/index.js';

function makeFact(overrides: Partial<Fact> = {}): Fact {
  return {
    id: 'fact-1',
    tenantId: 'tenant-1',
    scope: 'user',
    scopeId: 'user-1',
    sessionId: null,
    content: 'test fact',
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
    temporalScore: 0,
    source: 'vector',
    ...candidateOverrides,
  };
}

describe('extractTimeReference', () => {
  it('returns null for non-temporal queries', () => {
    expect(extractTimeReference('What does the user like?')).toBeNull();
    expect(extractTimeReference('Tell me about TypeScript')).toBeNull();
    expect(extractTimeReference('How does the system work?')).toBeNull();
  });

  it('extracts explicit date: "March 15th"', () => {
    const ref = extractTimeReference('What happened on March 15th?');
    expect(ref).not.toBeNull();
    expect(ref!.month).toBe(2); // 0-indexed
    expect(ref!.day).toBe(15);
  });

  it('extracts explicit date with year: "March 15, 2023"', () => {
    const ref = extractTimeReference('What happened on March 15, 2023?');
    expect(ref).not.toBeNull();
    expect(ref!.month).toBe(2);
    expect(ref!.day).toBe(15);
    expect(ref!.year).toBe(2023);
  });

  it('extracts reverse date format: "15th March"', () => {
    const ref = extractTimeReference('What happened on 15th March?');
    expect(ref).not.toBeNull();
    expect(ref!.month).toBe(2);
    expect(ref!.day).toBe(15);
  });

  it('extracts month-only: "in February"', () => {
    const ref = extractTimeReference('What happened in February?');
    expect(ref).not.toBeNull();
    expect(ref!.month).toBe(1); // 0-indexed
    expect(ref!.day).toBeUndefined();
  });

  it('extracts month abbreviation: "in Jan"', () => {
    const ref = extractTimeReference('meetings in jan');
    expect(ref).not.toBeNull();
    expect(ref!.month).toBe(0);
  });

  it('extracts ordering intent "first"', () => {
    const ref = extractTimeReference('When did we first discuss this?');
    expect(ref).not.toBeNull();
    expect(ref!.ordering).toBe('first');
  });

  it('extracts ordering intent "last"', () => {
    const ref = extractTimeReference('What was the last thing mentioned?');
    expect(ref).not.toBeNull();
    expect(ref!.ordering).toBe('last');
  });

  it('"last week" produces a date reference, not just ordering', () => {
    const ref = extractTimeReference('What happened last week?');
    expect(ref).not.toBeNull();
    expect(ref!.year).toBeDefined();
    expect(ref!.month).toBeDefined();
    expect(ref!.day).toBeDefined();
  });

  it('"yesterday" produces a date reference', () => {
    const ref = extractTimeReference('What did we discuss yesterday?');
    expect(ref).not.toBeNull();
    expect(ref!.year).toBeDefined();
    expect(ref!.month).toBeDefined();
    expect(ref!.day).toBeDefined();
  });
});

describe('scoreTemporalRelevance', () => {
  it('scores candidates by date proximity', () => {
    const c1 = makeCandidate(
      { id: 'close', eventDate: new Date('2025-03-14') as any },
    );
    const c2 = makeCandidate(
      { id: 'far', eventDate: new Date('2025-01-01') as any },
    );

    const timeRef = { month: 2, day: 15 }; // March 15
    scoreTemporalRelevance([c1, c2], timeRef);

    expect(c1.temporalScore).toBeGreaterThan(c2.temporalScore);
    expect(c1.temporalScore).toBeGreaterThan(0);
  });

  it('candidates without eventDate get temporalScore 0', () => {
    const c1 = makeCandidate({ id: 'no-date' });
    const c2 = makeCandidate(
      { id: 'has-date', eventDate: new Date('2025-03-15') as any },
    );

    const timeRef = { month: 2, day: 15 };
    scoreTemporalRelevance([c1, c2], timeRef);

    expect(c1.temporalScore).toBe(0);
  });

  it('ordering "first" scores earlier dates higher', () => {
    const c1 = makeCandidate(
      { id: 'early', eventDate: new Date('2024-01-01') as any },
    );
    const c2 = makeCandidate(
      { id: 'late', eventDate: new Date('2025-06-01') as any },
    );

    const timeRef = { ordering: 'first' as const };
    scoreTemporalRelevance([c1, c2], timeRef);

    expect(c1.temporalScore).toBeGreaterThan(c2.temporalScore);
  });

  it('ordering "last" scores later dates higher', () => {
    const c1 = makeCandidate(
      { id: 'early', eventDate: new Date('2024-01-01') as any },
    );
    const c2 = makeCandidate(
      { id: 'late', eventDate: new Date('2025-06-01') as any },
    );

    const timeRef = { ordering: 'last' as const };
    scoreTemporalRelevance([c1, c2], timeRef);

    expect(c2.temporalScore).toBeGreaterThan(c1.temporalScore);
  });

  it('ordering with no eventDates is a no-op', () => {
    const c1 = makeCandidate({ id: 'no-date-1' });
    const c2 = makeCandidate({ id: 'no-date-2' });

    const timeRef = { ordering: 'first' as const };
    scoreTemporalRelevance([c1, c2], timeRef);

    expect(c1.temporalScore).toBe(0);
    expect(c2.temporalScore).toBe(0);
  });
});

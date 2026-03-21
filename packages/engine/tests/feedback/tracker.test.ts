import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordAccesses, submitFeedback } from '../../src/feedback/tracker.js';
import type { StorageAdapter } from '../../src/adapters/storage.js';
import type { SearchResult } from '../../src/retrieval/types.js';
import type { Fact } from '../../src/models/index.js';

const validUuid = '00000000-0000-0000-0000-000000000001';
const validUuid2 = '00000000-0000-0000-0000-000000000002';
const validUuid3 = '00000000-0000-0000-0000-000000000003';

function makeFact(overrides: Partial<Fact> = {}): Fact {
  return {
    id: validUuid,
    tenantId: validUuid,
    scope: 'user',
    scopeId: 'user-1',
    sessionId: null,
    content: 'likes TypeScript',
    embeddingModel: 'text-embedding-3-small',
    embeddingDim: 1536,
    version: 1,
    lineageId: validUuid,
    validFrom: new Date('2025-01-01'),
    validUntil: null,
    operation: 'create',
    parentId: null,
    importance: 0.5,
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

function makeSearchResult(factOverrides: Partial<Fact> = {}, resultOverrides: Partial<SearchResult> = {}): SearchResult {
  return {
    fact: makeFact(factOverrides),
    score: 0.85,
    signals: {
      vectorScore: 0.9,
      keywordScore: 0.3,
      graphScore: 0.2,
      recencyScore: 0.7,
      salienceScore: 0.6,
    },
    ...resultOverrides,
  };
}

function mockStorage(): StorageAdapter & {
  createMemoryAccess: ReturnType<typeof vi.fn>;
  updateDecayScores: ReturnType<typeof vi.fn>;
  updateFeedback: ReturnType<typeof vi.fn>;
  getFact: ReturnType<typeof vi.fn>;
} {
  return {
    createMemoryAccess: vi.fn().mockResolvedValue({}),
    updateDecayScores: vi.fn().mockResolvedValue(undefined),
    updateFeedback: vi.fn().mockResolvedValue(undefined),
    getFact: vi.fn().mockResolvedValue(null),
  } as unknown as StorageAdapter & {
    createMemoryAccess: ReturnType<typeof vi.fn>;
    updateDecayScores: ReturnType<typeof vi.fn>;
    updateFeedback: ReturnType<typeof vi.fn>;
    getFact: ReturnType<typeof vi.fn>;
  };
}

describe('recordAccesses', () => {
  let storage: ReturnType<typeof mockStorage>;
  const tenantId = validUuid;
  const query = 'what does the user prefer?';

  beforeEach(() => {
    storage = mockStorage();
  });

  it('creates one MemoryAccess per result', async () => {
    const results = [
      makeSearchResult({ id: validUuid }),
      makeSearchResult({ id: validUuid2 }),
      makeSearchResult({ id: validUuid3 }),
    ];

    await recordAccesses(storage, tenantId, query, results);

    expect(storage.createMemoryAccess).toHaveBeenCalledTimes(3);
  });

  it('includes query, retrieval method, similarity score, and rank position', async () => {
    const results = [
      makeSearchResult({ id: validUuid }, {
        signals: { vectorScore: 0.92, keywordScore: 0, graphScore: 0, recencyScore: 0, salienceScore: 0 },
      }),
    ];

    await recordAccesses(storage, tenantId, query, results);

    const call = storage.createMemoryAccess.mock.calls[0]![0];
    expect(call.query).toBe(query);
    expect(call.retrievalMethod).toBe('fusion');
    expect(call.similarityScore).toBe(0.92);
    expect(call.rankPosition).toBe(1);
  });

  it('sets retrievalMethod to "trigger" when triggeredBy is present', async () => {
    const triggerId = validUuid2;
    const results = [
      makeSearchResult({ id: validUuid }, { triggeredBy: triggerId }),
    ];

    await recordAccesses(storage, tenantId, query, results);

    const call = storage.createMemoryAccess.mock.calls[0]![0];
    expect(call.retrievalMethod).toBe('trigger');
    expect(call.triggerId).toBe(triggerId);
  });

  it('sets similarityScore to undefined when vectorScore is 0', async () => {
    const results = [
      makeSearchResult({ id: validUuid }, {
        signals: { vectorScore: 0, keywordScore: 0.5, graphScore: 0, recencyScore: 0, salienceScore: 0 },
      }),
    ];

    await recordAccesses(storage, tenantId, query, results);

    const call = storage.createMemoryAccess.mock.calls[0]![0];
    expect(call.similarityScore).toBeUndefined();
  });

  it('calculates and updates decay scores', async () => {
    const results = [
      makeSearchResult({ id: validUuid, importance: 0.8, frequency: 5 }),
    ];

    await recordAccesses(storage, tenantId, query, results);

    expect(storage.updateDecayScores).toHaveBeenCalledTimes(1);
    const updateCall = storage.updateDecayScores.mock.calls[0]!;
    expect(updateCall[0]).toBe(tenantId);
    const updates = updateCall[1] as Array<{ id: string; decayScore: number }>;
    expect(updates).toHaveLength(1);
    expect(updates[0]!.id).toBe(validUuid);
    expect(updates[0]!.decayScore).toBeGreaterThan(0);
    expect(updates[0]!.decayScore).toBeLessThanOrEqual(1);
  });

  it('updates frequency (implicit via decayScore recalc)', async () => {
    const results = [
      makeSearchResult({ id: validUuid, frequency: 5 }),
    ];

    await recordAccesses(storage, tenantId, query, results);

    const updateCall = storage.updateDecayScores.mock.calls[0]!;
    const updates = updateCall[1] as Array<{ id: string; decayScore: number; frequency: number }>;
    expect(updates[0]!.frequency).toBe(6); // frequency + 1
  });

  it('assigns correct rank positions for multiple results', async () => {
    const results = [
      makeSearchResult({ id: validUuid }),
      makeSearchResult({ id: validUuid2 }),
    ];

    await recordAccesses(storage, tenantId, query, results);

    const call1 = storage.createMemoryAccess.mock.calls[0]![0];
    const call2 = storage.createMemoryAccess.mock.calls[1]![0];
    expect(call1.rankPosition).toBe(1);
    expect(call2.rankPosition).toBe(2);
  });

  it('does not create access records or update decay scores for empty results', async () => {
    await recordAccesses(storage, tenantId, query, []);

    expect(storage.createMemoryAccess).not.toHaveBeenCalled();
    expect(storage.updateDecayScores).not.toHaveBeenCalled();
  });
});

describe('submitFeedback', () => {
  let storage: ReturnType<typeof mockStorage>;
  const tenantId = validUuid;
  const factId = validUuid2;

  beforeEach(() => {
    storage = mockStorage();
  });

  it('updates the memory access record with feedback', async () => {
    storage.getFact.mockResolvedValue(makeFact({ id: factId }));

    await submitFeedback(storage, tenantId, factId, {
      wasUseful: true,
      feedbackType: 'explicit_positive',
      feedbackDetail: 'Very helpful!',
    });

    expect(storage.updateFeedback).toHaveBeenCalledWith(tenantId, factId, {
      wasUseful: true,
      feedbackType: 'explicit_positive',
      feedbackDetail: 'Very helpful!',
    });
  });

  it('with explicit_positive increases importance by 0.05', async () => {
    storage.getFact.mockResolvedValue(makeFact({ id: factId, importance: 0.5 }));

    await submitFeedback(storage, tenantId, factId, {
      wasUseful: true,
      feedbackType: 'explicit_positive',
    });

    const updateCall = storage.updateDecayScores.mock.calls[0]!;
    const updates = updateCall[1] as Array<{ id: string; importance: number }>;
    expect(updates[0]!.importance).toBeCloseTo(0.55, 5);
  });

  it('with implicit_positive increases importance by 0.05', async () => {
    storage.getFact.mockResolvedValue(makeFact({ id: factId, importance: 0.5 }));

    await submitFeedback(storage, tenantId, factId, {
      wasUseful: true,
      feedbackType: 'implicit_positive',
    });

    const updateCall = storage.updateDecayScores.mock.calls[0]!;
    const updates = updateCall[1] as Array<{ id: string; importance: number }>;
    expect(updates[0]!.importance).toBeCloseTo(0.55, 5);
  });

  it('with explicit_negative decreases importance by 0.05', async () => {
    storage.getFact.mockResolvedValue(makeFact({ id: factId, importance: 0.5 }));

    await submitFeedback(storage, tenantId, factId, {
      wasUseful: false,
      feedbackType: 'explicit_negative',
    });

    const updateCall = storage.updateDecayScores.mock.calls[0]!;
    const updates = updateCall[1] as Array<{ id: string; importance: number }>;
    expect(updates[0]!.importance).toBeCloseTo(0.45, 5);
  });

  it('with implicit_negative decreases importance by 0.05', async () => {
    storage.getFact.mockResolvedValue(makeFact({ id: factId, importance: 0.5 }));

    await submitFeedback(storage, tenantId, factId, {
      wasUseful: false,
      feedbackType: 'implicit_negative',
    });

    const updateCall = storage.updateDecayScores.mock.calls[0]!;
    const updates = updateCall[1] as Array<{ id: string; importance: number }>;
    expect(updates[0]!.importance).toBeCloseTo(0.45, 5);
  });

  it('with correction decreases importance by 0.1', async () => {
    storage.getFact.mockResolvedValue(makeFact({ id: factId, importance: 0.5 }));

    await submitFeedback(storage, tenantId, factId, {
      wasUseful: false,
      feedbackType: 'correction',
    });

    const updateCall = storage.updateDecayScores.mock.calls[0]!;
    const updates = updateCall[1] as Array<{ id: string; importance: number }>;
    expect(updates[0]!.importance).toBeCloseTo(0.4, 5);
  });

  it('importance cannot exceed 1.0 (upper bound)', async () => {
    storage.getFact.mockResolvedValue(makeFact({ id: factId, importance: 0.98 }));

    await submitFeedback(storage, tenantId, factId, {
      wasUseful: true,
      feedbackType: 'explicit_positive',
    });

    const updateCall = storage.updateDecayScores.mock.calls[0]!;
    const updates = updateCall[1] as Array<{ id: string; importance: number }>;
    expect(updates[0]!.importance).toBe(1.0);
  });

  it('importance cannot go below 0.1 (lower bound)', async () => {
    storage.getFact.mockResolvedValue(makeFact({ id: factId, importance: 0.12 }));

    await submitFeedback(storage, tenantId, factId, {
      wasUseful: false,
      feedbackType: 'correction',
    });

    const updateCall = storage.updateDecayScores.mock.calls[0]!;
    const updates = updateCall[1] as Array<{ id: string; importance: number }>;
    expect(updates[0]!.importance).toBe(0.1);
  });

  it('importance stays at 0.1 when already at minimum with negative feedback', async () => {
    storage.getFact.mockResolvedValue(makeFact({ id: factId, importance: 0.1 }));

    await submitFeedback(storage, tenantId, factId, {
      wasUseful: false,
      feedbackType: 'explicit_negative',
    });

    // Importance stays at 0.1, so newImportance === fact.importance, no update
    expect(storage.updateDecayScores).not.toHaveBeenCalled();
  });

  it('with non-existent fact returns silently', async () => {
    storage.getFact.mockResolvedValue(null);

    await submitFeedback(storage, tenantId, factId, {
      wasUseful: true,
      feedbackType: 'explicit_positive',
    });

    // updateFeedback is called first (before checking fact)
    expect(storage.updateFeedback).toHaveBeenCalled();
    // But updateDecayScores is NOT called since fact doesn't exist
    expect(storage.updateDecayScores).not.toHaveBeenCalled();
  });

  it('recalculates decay score when importance changes', async () => {
    storage.getFact.mockResolvedValue(makeFact({
      id: factId,
      importance: 0.5,
      frequency: 10,
      lastAccessed: new Date(),
    }));

    await submitFeedback(storage, tenantId, factId, {
      wasUseful: true,
      feedbackType: 'explicit_positive',
    });

    const updateCall = storage.updateDecayScores.mock.calls[0]!;
    const updates = updateCall[1] as Array<{ id: string; decayScore: number; importance: number }>;
    expect(updates[0]!.decayScore).toBeGreaterThan(0);
    expect(updates[0]!.decayScore).toBeLessThanOrEqual(1);
    expect(updates[0]!.importance).toBeCloseTo(0.55, 5);
  });
});

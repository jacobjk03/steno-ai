import { describe, it, expect, vi } from 'vitest';
import { keywordSearch } from '../../src/retrieval/keyword-search.js';
import type { StorageAdapter, KeywordSearchOptions, KeywordSearchResult } from '../../src/adapters/storage.js';
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

function mockStorageAdapter(
  results: KeywordSearchResult[] = [],
): StorageAdapter & { keywordSearch: ReturnType<typeof vi.fn> } {
  return {
    keywordSearch: vi.fn().mockResolvedValue(results),
  } as unknown as StorageAdapter & { keywordSearch: ReturnType<typeof vi.fn> };
}

describe('keywordSearch', () => {
  const tenantId = 'tenant-1';
  const scope = 'user';
  const scopeId = 'user-1';
  const limit = 10;

  it('calls storage.keywordSearch with correct params', async () => {
    const storageAdapter = mockStorageAdapter();

    await keywordSearch(storageAdapter, 'TypeScript', tenantId, scope, scopeId, limit);

    expect(storageAdapter.keywordSearch).toHaveBeenCalledWith({
      query: 'TypeScript',
      tenantId,
      scope,
      scopeId,
      limit,
      validOnly: true,
    });
    expect(storageAdapter.keywordSearch).toHaveBeenCalledTimes(1);
  });

  it('returns empty candidates for empty results', async () => {
    const storageAdapter = mockStorageAdapter([]);

    const candidates = await keywordSearch(storageAdapter, 'TypeScript', tenantId, scope, scopeId, limit);

    expect(candidates).toEqual([]);
  });

  it('single result gets keywordScore 1.0', async () => {
    const fact = makeFact({ id: 'fact-1', content: 'likes TypeScript' });
    const storageAdapter = mockStorageAdapter([
      { fact, rankScore: 0.42 },
    ]);

    const candidates = await keywordSearch(storageAdapter, 'TypeScript', tenantId, scope, scopeId, limit);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].keywordScore).toBe(1.0);
    expect(candidates[0].fact).toBe(fact);
  });

  it('normalizes rank scores: highest = 1.0, others proportional', async () => {
    const fact1 = makeFact({ id: 'fact-1', content: 'loves TypeScript' });
    const fact2 = makeFact({ id: 'fact-2', content: 'uses TypeScript at work' });
    const fact3 = makeFact({ id: 'fact-3', content: 'mentioned TypeScript once' });
    const storageAdapter = mockStorageAdapter([
      { fact: fact1, rankScore: 0.8 },
      { fact: fact2, rankScore: 0.4 },
      { fact: fact3, rankScore: 0.2 },
    ]);

    const candidates = await keywordSearch(storageAdapter, 'TypeScript', tenantId, scope, scopeId, limit);

    expect(candidates).toHaveLength(3);
    expect(candidates[0].keywordScore).toBe(1.0);        // 0.8 / 0.8
    expect(candidates[1].keywordScore).toBe(0.5);         // 0.4 / 0.8
    expect(candidates[2].keywordScore).toBe(0.25);        // 0.2 / 0.8
  });

  it('handles zero maxRank gracefully (all scores become 0)', async () => {
    const fact = makeFact({ id: 'fact-1' });
    const storageAdapter = mockStorageAdapter([
      { fact, rankScore: 0 },
    ]);

    const candidates = await keywordSearch(storageAdapter, 'query', tenantId, scope, scopeId, limit);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].keywordScore).toBe(0);
  });

  it('sets vector, graph, recency, and salience scores to 0', async () => {
    const fact = makeFact();
    const storageAdapter = mockStorageAdapter([
      { fact, rankScore: 0.5 },
    ]);

    const candidates = await keywordSearch(storageAdapter, 'query', tenantId, scope, scopeId, limit);

    expect(candidates[0].vectorScore).toBe(0);
    expect(candidates[0].graphScore).toBe(0);
    expect(candidates[0].recencyScore).toBe(0);
    expect(candidates[0].salienceScore).toBe(0);
  });

  it('sets source to "keyword"', async () => {
    const fact = makeFact();
    const storageAdapter = mockStorageAdapter([
      { fact, rankScore: 0.5 },
    ]);

    const candidates = await keywordSearch(storageAdapter, 'query', tenantId, scope, scopeId, limit);

    expect(candidates[0].source).toBe('keyword');
  });

  it('preserves fact references in candidates', async () => {
    const fact1 = makeFact({ id: 'fact-1', content: 'alpha' });
    const fact2 = makeFact({ id: 'fact-2', content: 'beta' });
    const storageAdapter = mockStorageAdapter([
      { fact: fact1, rankScore: 0.6 },
      { fact: fact2, rankScore: 0.3 },
    ]);

    const candidates = await keywordSearch(storageAdapter, 'query', tenantId, scope, scopeId, limit);

    expect(candidates[0].fact).toBe(fact1);
    expect(candidates[1].fact).toBe(fact2);
  });
});

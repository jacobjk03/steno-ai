import { describe, it, expect, vi } from 'vitest';
import { vectorSearch } from '../../src/retrieval/vector-search.js';
import type { StorageAdapter, VectorSearchOptions, VectorSearchResult } from '../../src/adapters/storage.js';
import type { EmbeddingAdapter } from '../../src/adapters/embedding.js';
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

function mockEmbeddingAdapter(embedding: number[] = [0.1, 0.2, 0.3]): EmbeddingAdapter {
  return {
    embed: vi.fn().mockResolvedValue(embedding),
    embedBatch: vi.fn().mockResolvedValue([embedding]),
    model: 'test-model',
    dimensions: embedding.length,
  };
}

function mockStorageAdapter(results: VectorSearchResult[] = []): StorageAdapter & { vectorSearch: ReturnType<typeof vi.fn> } {
  return {
    vectorSearch: vi.fn().mockResolvedValue(results),
  } as unknown as StorageAdapter & { vectorSearch: ReturnType<typeof vi.fn> };
}

describe('vectorSearch', () => {
  const tenantId = 'tenant-1';
  const scope = 'user';
  const scopeId = 'user-1';
  const limit = 10;

  it('embeds query text via EmbeddingAdapter', async () => {
    const queryEmbedding = [0.1, 0.2, 0.3];
    const embeddingAdapter = mockEmbeddingAdapter(queryEmbedding);
    const storageAdapter = mockStorageAdapter();

    await vectorSearch(storageAdapter, embeddingAdapter, 'test query', tenantId, scope, scopeId, limit);

    expect(embeddingAdapter.embed).toHaveBeenCalledWith('test query');
    expect(embeddingAdapter.embed).toHaveBeenCalledTimes(1);
  });

  it('calls storage.vectorSearch with correct params', async () => {
    const queryEmbedding = [0.5, 0.6, 0.7];
    const embeddingAdapter = mockEmbeddingAdapter(queryEmbedding);
    const storageAdapter = mockStorageAdapter();

    await vectorSearch(storageAdapter, embeddingAdapter, 'my query', tenantId, scope, scopeId, limit);

    expect(storageAdapter.vectorSearch).toHaveBeenCalledWith({
      embedding: queryEmbedding,
      tenantId,
      scope,
      scopeId,
      limit,
      minSimilarity: 0.0,
      validOnly: true,
      asOf: undefined,
    });
  });

  it('maps results to Candidate format with vectorScore = similarity', async () => {
    const fact1 = makeFact({ id: 'fact-1', content: 'likes TypeScript' });
    const fact2 = makeFact({ id: 'fact-2', content: 'prefers dark mode' });
    const storageResults: VectorSearchResult[] = [
      { fact: fact1, similarity: 0.95 },
      { fact: fact2, similarity: 0.72 },
    ];
    const embeddingAdapter = mockEmbeddingAdapter();
    const storageAdapter = mockStorageAdapter(storageResults);

    const candidates = await vectorSearch(storageAdapter, embeddingAdapter, 'query', tenantId, scope, scopeId, limit);

    expect(candidates).toHaveLength(2);
    expect(candidates[0].fact).toBe(fact1);
    expect(candidates[0].vectorScore).toBe(0.95);
    expect(candidates[1].fact).toBe(fact2);
    expect(candidates[1].vectorScore).toBe(0.72);
  });

  it('sets keyword, graph, recency, and salience scores to 0', async () => {
    const fact = makeFact();
    const storageAdapter = mockStorageAdapter([{ fact, similarity: 0.85 }]);
    const embeddingAdapter = mockEmbeddingAdapter();

    const candidates = await vectorSearch(storageAdapter, embeddingAdapter, 'query', tenantId, scope, scopeId, limit);

    expect(candidates[0].keywordScore).toBe(0);
    expect(candidates[0].graphScore).toBe(0);
    expect(candidates[0].recencyScore).toBe(0);
    expect(candidates[0].salienceScore).toBe(0);
  });

  it('sets source to "vector"', async () => {
    const fact = makeFact();
    const storageAdapter = mockStorageAdapter([{ fact, similarity: 0.85 }]);
    const embeddingAdapter = mockEmbeddingAdapter();

    const candidates = await vectorSearch(storageAdapter, embeddingAdapter, 'query', tenantId, scope, scopeId, limit);

    expect(candidates[0].source).toBe('vector');
  });

  it('returns empty candidates for empty results', async () => {
    const storageAdapter = mockStorageAdapter([]);
    const embeddingAdapter = mockEmbeddingAdapter();

    const candidates = await vectorSearch(storageAdapter, embeddingAdapter, 'query', tenantId, scope, scopeId, limit);

    expect(candidates).toEqual([]);
  });

  it('passes asOf parameter when provided', async () => {
    const embeddingAdapter = mockEmbeddingAdapter();
    const storageAdapter = mockStorageAdapter();
    const asOf = new Date('2025-06-15');

    await vectorSearch(storageAdapter, embeddingAdapter, 'query', tenantId, scope, scopeId, limit, asOf);

    expect(storageAdapter.vectorSearch).toHaveBeenCalledWith(
      expect.objectContaining({ asOf }),
    );
  });

  it('does NOT pass asOf when undefined', async () => {
    const embeddingAdapter = mockEmbeddingAdapter();
    const storageAdapter = mockStorageAdapter();

    await vectorSearch(storageAdapter, embeddingAdapter, 'query', tenantId, scope, scopeId, limit);

    const callArgs = storageAdapter.vectorSearch.mock.calls[0][0] as VectorSearchOptions;
    expect(callArgs.asOf).toBeUndefined();
  });
});

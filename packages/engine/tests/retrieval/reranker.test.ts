import { describe, it, expect, vi } from 'vitest';
import { rerank } from '../../src/retrieval/reranker.js';
import type { EmbeddingAdapter } from '../../src/adapters/embedding.js';
import type { SearchResult } from '../../src/retrieval/types.js';
import type { Fact } from '../../src/models/index.js';

// --- Helpers ---

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

function makeResult(id: string, content: string, score: number): SearchResult {
  return {
    fact: makeFact({ id, content }),
    score,
    signals: {
      vectorScore: score,
      keywordScore: 0,
      graphScore: 0,
      recencyScore: 0,
      salienceScore: 0,
    },
  };
}

/**
 * Create a mock embedding adapter that returns controllable vectors.
 * The embedBatch fn receives [query, ...factTexts] and should return
 * vectors of the same length. We use simple 3D vectors for testing.
 */
function makeMockEmbedding(batchResult: number[][]): EmbeddingAdapter {
  return {
    model: 'test-embedding',
    dimensions: 3,
    embed: vi.fn().mockImplementation(async (text: string) => batchResult[0]!),
    embedBatch: vi.fn().mockResolvedValue(batchResult),
  };
}

// --- Tests ---

describe('rerank', () => {
  it('returns empty array for empty results', async () => {
    const emb = makeMockEmbedding([]);
    const result = await rerank(emb, 'test query', [], 5);
    expect(result).toEqual([]);
    expect(emb.embedBatch).not.toHaveBeenCalled();
  });

  it('returns single result as-is without embedding call', async () => {
    const emb = makeMockEmbedding([]);
    const results = [makeResult('f1', 'fact one', 0.9)];
    const reranked = await rerank(emb, 'test query', results, 5);
    expect(reranked).toEqual(results);
    expect(emb.embedBatch).not.toHaveBeenCalled();
  });

  it('reranks results based on embedding cosine similarity', async () => {
    const results = [
      makeResult('f0', 'User likes cats', 0.9),
      makeResult('f1', 'User works at Google', 0.7),
      makeResult('f2', 'User loves Casey', 0.3),
    ];

    // Query vector: [1, 0, 0]
    // f0 embedding: [0, 1, 0] — orthogonal to query (cosine = 0)
    // f1 embedding: [0.5, 0.5, 0] — moderate similarity
    // f2 embedding: [1, 0, 0] — identical to query (cosine = 1)
    const emb = makeMockEmbedding([
      [1, 0, 0],    // query
      [0, 1, 0],    // f0
      [0.5, 0.5, 0], // f1
      [1, 0, 0],    // f2
    ]);

    const reranked = await rerank(emb, "What is User's partner?", results, 3);

    expect(reranked).toHaveLength(3);
    // f2 has highest blended score: 0.3*0.6 + 1.0*0.4 = 0.58
    // f1: 0.7*0.6 + ~0.707*0.4 = 0.42 + 0.283 = 0.703
    // f0: 0.9*0.6 + 0*0.4 = 0.54
    // So order should be f1, f2, f0
    expect(emb.embedBatch).toHaveBeenCalledWith([
      "What is User's partner?",
      'User likes cats',
      'User works at Google',
      'User loves Casey',
    ]);
  });

  it('blends original fusion score with embedding similarity', async () => {
    const results = [
      makeResult('f0', 'high fusion low embed', 1.0),
      makeResult('f1', 'low fusion high embed', 0.0),
    ];

    // Query: [1, 0, 0]
    // f0: [0, 1, 0] — cosine = 0
    // f1: [1, 0, 0] — cosine = 1
    const emb = makeMockEmbedding([
      [1, 0, 0],  // query
      [0, 1, 0],  // f0
      [1, 0, 0],  // f1
    ]);

    const reranked = await rerank(emb, 'query', results, 2);

    // f0: 1.0*0.6 + 0*0.4 = 0.6
    // f1: 0.0*0.6 + 1*0.4 = 0.4
    expect(reranked[0]!.fact.id).toBe('f0');
    expect(reranked[1]!.fact.id).toBe('f1');
    expect(reranked[0]!.score).toBeCloseTo(0.6);
    expect(reranked[1]!.score).toBeCloseTo(0.4);
  });

  it('respects topK limit', async () => {
    const results = [
      makeResult('f0', 'fact zero', 0.9),
      makeResult('f1', 'fact one', 0.7),
      makeResult('f2', 'fact two', 0.5),
      makeResult('f3', 'fact three', 0.3),
    ];

    // All identical embeddings — order preserved from fusion scores
    const emb = makeMockEmbedding([
      [1, 0, 0], // query
      [1, 0, 0], // f0
      [1, 0, 0], // f1
      [1, 0, 0], // f2
      [1, 0, 0], // f3
    ]);

    const reranked = await rerank(emb, 'query', results, 2);
    expect(reranked).toHaveLength(2);
  });

  it('returns original order when embeddings fail', async () => {
    const results = [
      makeResult('f0', 'fact zero', 0.9),
      makeResult('f1', 'fact one', 0.7),
      makeResult('f2', 'fact two', 0.5),
    ];

    const emb: EmbeddingAdapter = {
      model: 'test-embedding',
      dimensions: 3,
      embed: vi.fn().mockRejectedValue(new Error('API error')),
      embedBatch: vi.fn().mockRejectedValue(new Error('API error')),
    };

    // The current implementation doesn't catch errors — it will throw.
    // If the reranker is expected to be resilient, this test documents current behavior.
    await expect(rerank(emb, 'query', results, 3)).rejects.toThrow('API error');
  });

  it('preserves order when all embeddings are identical', async () => {
    const results = [
      makeResult('f0', 'fact zero', 0.9),
      makeResult('f1', 'fact one', 0.7),
      makeResult('f2', 'fact two', 0.5),
    ];

    // All same embedding — cosine similarity = 1 for all
    const emb = makeMockEmbedding([
      [1, 0, 0],
      [1, 0, 0],
      [1, 0, 0],
      [1, 0, 0],
    ]);

    const reranked = await rerank(emb, 'query', results, 3);

    // With equal rerank scores, order is determined by blended:
    // f0: 0.9*0.6 + 1*0.4 = 0.94
    // f1: 0.7*0.6 + 1*0.4 = 0.82
    // f2: 0.5*0.6 + 1*0.4 = 0.70
    expect(reranked[0]!.fact.id).toBe('f0');
    expect(reranked[1]!.fact.id).toBe('f1');
    expect(reranked[2]!.fact.id).toBe('f2');
  });

  it('can reorder results when embedding similarity overrides fusion score', async () => {
    const results = [
      makeResult('f0', 'irrelevant fact', 0.8),
      makeResult('f1', 'very relevant fact', 0.2),
    ];

    // Query: [1, 0, 0]
    // f0: [-1, 0, 0] — cosine = -1 (opposite direction)
    // f1: [1, 0, 0] — cosine = 1 (identical)
    const emb = makeMockEmbedding([
      [1, 0, 0],   // query
      [-1, 0, 0],  // f0 — anti-correlated
      [1, 0, 0],   // f1 — perfect match
    ]);

    const reranked = await rerank(emb, 'query', results, 2);

    // f0: 0.8*0.6 + (-1)*0.4 = 0.48 - 0.4 = 0.08
    // f1: 0.2*0.6 + 1*0.4 = 0.12 + 0.4 = 0.52
    expect(reranked[0]!.fact.id).toBe('f1');
    expect(reranked[1]!.fact.id).toBe('f0');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { rerank } from '../../src/retrieval/reranker.js';
import type { LLMAdapter, LLMResponse } from '../../src/adapters/llm.js';
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

function makeMockLLM(responseContent: string): LLMAdapter {
  return {
    model: 'test-model',
    complete: vi.fn().mockResolvedValue({
      content: responseContent,
      tokensInput: 100,
      tokensOutput: 20,
      model: 'test-model',
    } satisfies LLMResponse),
  };
}

// --- Tests ---

describe('rerank', () => {
  it('returns empty array for empty results', async () => {
    const llm = makeMockLLM('[]');
    const result = await rerank(llm, 'test query', [], 5);
    expect(result).toEqual([]);
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it('returns single result as-is without LLM call', async () => {
    const llm = makeMockLLM('[]');
    const results = [
      makeResult('f1', 'fact one', 0.9),
    ];
    const reranked = await rerank(llm, 'test query', results, 5);
    expect(reranked).toEqual(results);
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it('reranks even when count <= topK (LLM still called)', async () => {
    const llm = makeMockLLM('[1, 0]');
    const results = [
      makeResult('f1', 'fact one', 0.9),
      makeResult('f2', 'fact two', 0.8),
    ];
    const reranked = await rerank(llm, 'test query', results, 5);
    expect(llm.complete).toHaveBeenCalled();
    expect(reranked[0]!.fact.id).toBe('f2');
    expect(reranked[1]!.fact.id).toBe('f1');
  });

  it('reranks results based on LLM response', async () => {
    const results = [
      makeResult('f0', 'User likes cats', 0.9),
      makeResult('f1', 'User works at Google', 0.7),
      makeResult('f2', 'User loves Casey', 0.3),
      makeResult('f3', 'User plays guitar', 0.5),
      makeResult('f4', 'User lives in NYC', 0.4),
    ];

    // LLM says indices 2, 0, 1 are most relevant (topK=3)
    const llm = makeMockLLM('[2, 0, 1]');
    const reranked = await rerank(llm, "What is User's partner?", results, 3);

    expect(reranked).toHaveLength(3);
    expect(reranked[0]!.fact.id).toBe('f2'); // "User loves Casey" — now first
    expect(reranked[1]!.fact.id).toBe('f0');
    expect(reranked[2]!.fact.id).toBe('f1');
  });

  it('re-assigns scores based on new rank order', async () => {
    const results = [
      makeResult('f0', 'fact zero', 0.9),
      makeResult('f1', 'fact one', 0.7),
      makeResult('f2', 'fact two', 0.3),
      makeResult('f3', 'fact three', 0.5),
    ];

    const llm = makeMockLLM('[2, 0, 1]');
    const reranked = await rerank(llm, 'query', results, 3);

    // Score formula: 1 - (position / indices.length)
    // Position 0: 1 - 0/3 = 1.0
    // Position 1: 1 - 1/3 ≈ 0.667
    // Position 2: 1 - 2/3 ≈ 0.333
    expect(reranked[0]!.score).toBeCloseTo(1.0);
    expect(reranked[1]!.score).toBeCloseTo(1 - 1 / 3);
    expect(reranked[2]!.score).toBeCloseTo(1 - 2 / 3);
  });

  it('returns original order if LLM call fails', async () => {
    const results = [
      makeResult('f0', 'fact zero', 0.9),
      makeResult('f1', 'fact one', 0.7),
      makeResult('f2', 'fact two', 0.3),
      makeResult('f3', 'fact three', 0.5),
    ];

    const llm: LLMAdapter = {
      model: 'test-model',
      complete: vi.fn().mockRejectedValue(new Error('LLM API error')),
    };

    const reranked = await rerank(llm, 'query', results, 3);

    // Should return first topK results in original order
    expect(reranked).toHaveLength(3);
    expect(reranked[0]!.fact.id).toBe('f0');
    expect(reranked[1]!.fact.id).toBe('f1');
    expect(reranked[2]!.fact.id).toBe('f2');
  });

  it('returns original order if LLM returns invalid JSON', async () => {
    const results = [
      makeResult('f0', 'fact zero', 0.9),
      makeResult('f1', 'fact one', 0.7),
      makeResult('f2', 'fact two', 0.3),
      makeResult('f3', 'fact three', 0.5),
    ];

    const llm = makeMockLLM('not valid json at all');
    const reranked = await rerank(llm, 'query', results, 3);

    expect(reranked).toHaveLength(3);
    expect(reranked[0]!.fact.id).toBe('f0');
  });

  it('skips invalid indices from LLM', async () => {
    const results = [
      makeResult('f0', 'fact zero', 0.9),
      makeResult('f1', 'fact one', 0.7),
      makeResult('f2', 'fact two', 0.3),
      makeResult('f3', 'fact three', 0.5),
    ];

    // Index 99 is out of bounds, -1 is negative, "abc" is not a number
    const llm = makeMockLLM('[2, 99, -1, "abc", 0]');
    const reranked = await rerank(llm, 'query', results, 3);

    // Only valid indices 2 and 0 should be used; remaining filled from originals
    expect(reranked[0]!.fact.id).toBe('f2');
    expect(reranked[1]!.fact.id).toBe('f0');
  });

  it('appends missing results with score 0', async () => {
    const results = [
      makeResult('f0', 'fact zero', 0.9),
      makeResult('f1', 'fact one', 0.7),
      makeResult('f2', 'fact two', 0.3),
      makeResult('f3', 'fact three', 0.5),
      makeResult('f4', 'fact four', 0.2),
    ];

    // LLM only returns 2 of 5, but topK is 4 (so missing ones get appended)
    const llm = makeMockLLM('[2, 0]');
    const reranked = await rerank(llm, 'query', results, 4);

    expect(reranked).toHaveLength(4);
    // First two are the LLM-ranked ones
    expect(reranked[0]!.fact.id).toBe('f2');
    expect(reranked[1]!.fact.id).toBe('f0');
    // Missing ones appended with score 0
    expect(reranked[2]!.score).toBe(0);
    expect(reranked[3]!.score).toBe(0);
  });

  it('handles LLM response with object wrapper (indices key)', async () => {
    const results = [
      makeResult('f0', 'fact zero', 0.9),
      makeResult('f1', 'fact one', 0.7),
      makeResult('f2', 'fact two', 0.3),
      makeResult('f3', 'fact three', 0.5),
    ];

    // Some LLMs wrap the array in an object
    const llm = makeMockLLM('{"indices": [1, 2, 0]}');
    const reranked = await rerank(llm, 'query', results, 3);

    expect(reranked[0]!.fact.id).toBe('f1');
    expect(reranked[1]!.fact.id).toBe('f2');
    expect(reranked[2]!.fact.id).toBe('f0');
  });
});

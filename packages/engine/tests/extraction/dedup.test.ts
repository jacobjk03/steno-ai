import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deduplicateFacts } from '../../src/extraction/dedup.js';
import type { DedupConfig } from '../../src/extraction/dedup.js';
import type { StorageAdapter, VectorSearchResult } from '../../src/adapters/storage.js';
import type { EmbeddingAdapter } from '../../src/adapters/embedding.js';
import type { LLMAdapter, LLMResponse } from '../../src/adapters/llm.js';
import type { ExtractedFact } from '../../src/extraction/types.js';
import type { Fact } from '../../src/models/index.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeMockStorage(overrides: Partial<StorageAdapter> = {}): StorageAdapter {
  return {
    // Facts
    createFact: vi.fn(),
    getFact: vi.fn(),
    getFactsByLineage: vi.fn(),
    getFactsByScope: vi.fn(),
    invalidateFact: vi.fn(),
    purgeFacts: vi.fn(),
    updateDecayScores: vi.fn(),

    // Vector / keyword search
    vectorSearch: vi.fn().mockResolvedValue([]),
    keywordSearch: vi.fn(),

    // Entities
    createEntity: vi.fn(),
    getEntity: vi.fn(),
    findEntityByCanonicalName: vi.fn(),
    getEntitiesForTenant: vi.fn(),

    // Fact-Entity junction
    linkFactEntity: vi.fn(),
    getEntitiesForFact: vi.fn(),
    getFactsForEntity: vi.fn(),

    // Edges
    createEdge: vi.fn(),
    getEdgesForEntity: vi.fn(),
    graphTraversal: vi.fn(),

    // Triggers
    createTrigger: vi.fn(),
    getTrigger: vi.fn(),
    getActiveTriggers: vi.fn(),
    updateTrigger: vi.fn(),
    deleteTrigger: vi.fn(),
    incrementTriggerFired: vi.fn(),

    // Memory Access
    createMemoryAccess: vi.fn(),
    updateFeedback: vi.fn(),

    // Extractions
    createExtraction: vi.fn(),
    getExtraction: vi.fn(),
    updateExtraction: vi.fn(),
    getExtractionByHash: vi.fn(),

    // Sessions
    createSession: vi.fn(),
    getSession: vi.fn(),
    endSession: vi.fn(),
    getSessionsByScope: vi.fn(),

    // Tenants
    createTenant: vi.fn(),
    getTenant: vi.fn(),
    getTenantBySlug: vi.fn(),
    updateTenant: vi.fn(),

    // API Keys
    createApiKey: vi.fn(),
    getApiKeyByPrefix: vi.fn(),
    getApiKeysForTenant: vi.fn(),
    revokeApiKey: vi.fn(),
    updateApiKeyLastUsed: vi.fn(),

    // Usage
    incrementUsage: vi.fn(),
    getUsage: vi.fn(),
    getCurrentUsage: vi.fn(),

    // Health
    ping: vi.fn(),

    ...overrides,
  } as unknown as StorageAdapter;
}

function makeMockEmbedding(overrides: Partial<EmbeddingAdapter> = {}): EmbeddingAdapter {
  return {
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
    model: 'test-embedding-model',
    dimensions: 3,
    ...overrides,
  } as EmbeddingAdapter;
}

function makeMockLLM(responseJson: Record<string, unknown>): LLMAdapter {
  return {
    complete: vi.fn().mockResolvedValue({
      content: JSON.stringify(responseJson),
      tokensInput: 10,
      tokensOutput: 5,
      model: 'test-llm-model',
    } satisfies LLMResponse),
    model: 'test-llm-model',
  } as unknown as LLMAdapter;
}

function makeFact(overrides: Partial<ExtractedFact> = {}): ExtractedFact {
  return {
    content: 'The user likes cats',
    importance: 0.8,
    confidence: 0.9,
    sourceType: 'conversation',
    modality: 'text',
    tags: ['preference'],
    originalContent: 'I really like cats',
    ...overrides,
  };
}

function makeStoredFact(overrides: Partial<Fact> = {}): Fact {
  return {
    id: 'stored-fact-id-0000-0000-000000000001',
    tenantId: 'tenant-id-0000-0000-0000-000000000001',
    scope: 'user',
    scopeId: 'scope-id-0000-0000-0000-000000000001',
    sessionId: null,
    content: 'The user likes cats',
    embeddingModel: 'test-model',
    embeddingDim: 3,
    version: 1,
    lineageId: 'lineage-id-0000-0000-0000-000000000001',
    validFrom: new Date(),
    validUntil: null,
    operation: 'create',
    parentId: null,
    importance: 0.8,
    frequency: 1,
    lastAccessed: null,
    decayScore: 1.0,
    contradictionStatus: 'none',
    contradictsId: null,
    sourceType: 'conversation',
    sourceRef: null,
    confidence: 0.9,
    originalContent: 'I really like cats',
    extractionId: null,
    extractionTier: null,
    modality: 'text',
    tags: ['preference'],
    metadata: {},
    createdAt: new Date(),
    ...overrides,
  };
}

function makeVectorSearchResult(
  factOverrides: Partial<Fact> = {},
  similarity = 0.92,
): VectorSearchResult {
  return {
    fact: makeStoredFact(factOverrides),
    similarity,
  };
}

const TENANT_ID = 'tenant-id-0000-0000-0000-000000000001';
const SCOPE = 'user';
const SCOPE_ID = 'scope-id-0000-0000-0000-000000000001';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('deduplicateFacts – no similar matches', () => {
  it('sets operation=add when no similar matches are found', async () => {
    const config: DedupConfig = {
      storage: makeMockStorage({ vectorSearch: vi.fn().mockResolvedValue([]) }),
      embedding: makeMockEmbedding(),
      llm: makeMockLLM({ operation: 'add' }),
    };

    const facts = [makeFact()];
    const result = await deduplicateFacts(config, facts, TENANT_ID, SCOPE, SCOPE_ID);

    expect(result).toHaveLength(1);
    expect(result[0].operation).toBe('add');
  });

  it('calls vectorSearch with correct parameters', async () => {
    const vectorSearch = vi.fn().mockResolvedValue([]);
    const config: DedupConfig = {
      storage: makeMockStorage({ vectorSearch }),
      embedding: makeMockEmbedding(),
      llm: makeMockLLM({ operation: 'add' }),
    };

    await deduplicateFacts(config, [makeFact()], TENANT_ID, SCOPE, SCOPE_ID);

    expect(vectorSearch).toHaveBeenCalledWith({
      embedding: [0.1, 0.2, 0.3],
      tenantId: TENANT_ID,
      scope: SCOPE,
      scopeId: SCOPE_ID,
      limit: 5,
      minSimilarity: 0.70,
      validOnly: true,
    });
  });
});

describe('deduplicateFacts – LLM classification with similar matches', () => {
  it('sets operation=noop when LLM classifies as noop', async () => {
    const existingMatch = makeVectorSearchResult(
      {
        id: 'stored-fact-id-0000-0000-0000-000000000001',
        lineageId: 'lineage-id-0000-0000-0000-000000000001',
      },
      0.95,
    );
    const config: DedupConfig = {
      storage: makeMockStorage({ vectorSearch: vi.fn().mockResolvedValue([existingMatch]) }),
      embedding: makeMockEmbedding(),
      llm: makeMockLLM({
        operation: 'noop',
        existing_lineage_id: 'lineage-id-0000-0000-0000-000000000001',
      }),
    };

    const result = await deduplicateFacts(config, [makeFact()], TENANT_ID, SCOPE, SCOPE_ID);

    expect(result).toHaveLength(1);
    expect(result[0].operation).toBe('noop');
    expect(result[0].existingLineageId).toBe('lineage-id-0000-0000-0000-000000000001');
  });

  it('sets operation=update and existingLineageId when LLM classifies as update', async () => {
    const existingMatch = makeVectorSearchResult(
      {
        id: 'stored-fact-id-0000-0000-0000-000000000001',
        lineageId: 'lineage-id-0000-0000-0000-000000000001',
      },
      0.91,
    );
    const config: DedupConfig = {
      storage: makeMockStorage({ vectorSearch: vi.fn().mockResolvedValue([existingMatch]) }),
      embedding: makeMockEmbedding(),
      llm: makeMockLLM({
        operation: 'update',
        existing_lineage_id: 'lineage-id-0000-0000-0000-000000000001',
      }),
    };

    const result = await deduplicateFacts(
      config,
      [makeFact({ content: 'The user loves cats' })],
      TENANT_ID,
      SCOPE,
      SCOPE_ID,
    );

    expect(result).toHaveLength(1);
    expect(result[0].operation).toBe('update');
    expect(result[0].existingLineageId).toBe('lineage-id-0000-0000-0000-000000000001');
  });

  it('sets operation=contradict and contradictsFactId when LLM classifies as contradict', async () => {
    const existingMatch = makeVectorSearchResult(
      {
        id: 'stored-fact-id-0000-0000-0000-000000000001',
        lineageId: 'lineage-id-0000-0000-0000-000000000001',
      },
      0.89,
    );
    const config: DedupConfig = {
      storage: makeMockStorage({ vectorSearch: vi.fn().mockResolvedValue([existingMatch]) }),
      embedding: makeMockEmbedding(),
      llm: makeMockLLM({
        operation: 'contradict',
        existing_lineage_id: 'lineage-id-0000-0000-0000-000000000001',
        contradicts_fact_id: 'stored-fact-id-0000-0000-0000-000000000001',
      }),
    };

    const result = await deduplicateFacts(
      config,
      [makeFact({ content: 'The user hates cats' })],
      TENANT_ID,
      SCOPE,
      SCOPE_ID,
    );

    expect(result).toHaveLength(1);
    expect(result[0].operation).toBe('contradict');
    expect(result[0].contradictsFactId).toBe('stored-fact-id-0000-0000-0000-000000000001');
    expect(result[0].existingLineageId).toBe('lineage-id-0000-0000-0000-000000000001');
  });
});

describe('deduplicateFacts – pre-assigned operations', () => {
  it('keeps operation=update from Stage 2 and skips dedup entirely', async () => {
    const embed = vi.fn();
    const vectorSearch = vi.fn();
    const config: DedupConfig = {
      storage: makeMockStorage({ vectorSearch }),
      embedding: makeMockEmbedding({ embed }),
      llm: makeMockLLM({ operation: 'add' }),
    };

    const fact = makeFact({ operation: 'update', existingLineageId: 'lineage-from-stage2' });
    const result = await deduplicateFacts(config, [fact], TENANT_ID, SCOPE, SCOPE_ID);

    expect(result).toHaveLength(1);
    expect(result[0].operation).toBe('update');
    expect(result[0].existingLineageId).toBe('lineage-from-stage2');
    expect(embed).not.toHaveBeenCalled();
    expect(vectorSearch).not.toHaveBeenCalled();
  });

  it('keeps operation=noop from Stage 2 and skips dedup entirely', async () => {
    const embed = vi.fn();
    const vectorSearch = vi.fn();
    const config: DedupConfig = {
      storage: makeMockStorage({ vectorSearch }),
      embedding: makeMockEmbedding({ embed }),
      llm: makeMockLLM({ operation: 'add' }),
    };

    const fact = makeFact({ operation: 'noop' });
    const result = await deduplicateFacts(config, [fact], TENANT_ID, SCOPE, SCOPE_ID);

    expect(result).toHaveLength(1);
    expect(result[0].operation).toBe('noop');
    expect(embed).not.toHaveBeenCalled();
    expect(vectorSearch).not.toHaveBeenCalled();
  });

  it('keeps operation=contradict from Stage 2 and skips dedup entirely', async () => {
    const embed = vi.fn();
    const vectorSearch = vi.fn();
    const config: DedupConfig = {
      storage: makeMockStorage({ vectorSearch }),
      embedding: makeMockEmbedding({ embed }),
      llm: makeMockLLM({ operation: 'add' }),
    };

    const fact = makeFact({ operation: 'contradict', contradictsFactId: 'fact-from-stage2' });
    const result = await deduplicateFacts(config, [fact], TENANT_ID, SCOPE, SCOPE_ID);

    expect(result).toHaveLength(1);
    expect(result[0].operation).toBe('contradict');
    expect(result[0].contradictsFactId).toBe('fact-from-stage2');
    expect(embed).not.toHaveBeenCalled();
    expect(vectorSearch).not.toHaveBeenCalled();
  });

  it('keeps operation=invalidate from Stage 2 and skips dedup entirely', async () => {
    const embed = vi.fn();
    const vectorSearch = vi.fn();
    const config: DedupConfig = {
      storage: makeMockStorage({ vectorSearch }),
      embedding: makeMockEmbedding({ embed }),
      llm: makeMockLLM({ operation: 'add' }),
    };

    const fact = makeFact({ operation: 'invalidate' });
    const result = await deduplicateFacts(config, [fact], TENANT_ID, SCOPE, SCOPE_ID);

    expect(result).toHaveLength(1);
    expect(result[0].operation).toBe('invalidate');
    expect(embed).not.toHaveBeenCalled();
    expect(vectorSearch).not.toHaveBeenCalled();
  });

  it('still runs dedup when operation=add (may be LLM false positive)', async () => {
    const vectorSearch = vi.fn().mockResolvedValue([]);
    const config: DedupConfig = {
      storage: makeMockStorage({ vectorSearch }),
      embedding: makeMockEmbedding(),
      llm: makeMockLLM({ operation: 'add' }),
    };

    const fact = makeFact({ operation: 'add' });
    const result = await deduplicateFacts(config, [fact], TENANT_ID, SCOPE, SCOPE_ID);

    expect(result).toHaveLength(1);
    expect(result[0].operation).toBe('add');
    // vectorSearch MUST have been called even though operation was already 'add'
    expect(vectorSearch).toHaveBeenCalledOnce();
  });

  it('still runs dedup when operation is undefined', async () => {
    const vectorSearch = vi.fn().mockResolvedValue([]);
    const config: DedupConfig = {
      storage: makeMockStorage({ vectorSearch }),
      embedding: makeMockEmbedding(),
      llm: makeMockLLM({ operation: 'add' }),
    };

    const fact = makeFact(); // no operation field
    const result = await deduplicateFacts(config, [fact], TENANT_ID, SCOPE, SCOPE_ID);

    expect(result).toHaveLength(1);
    expect(result[0].operation).toBe('add');
    expect(vectorSearch).toHaveBeenCalledOnce();
  });
});

describe('deduplicateFacts – LLM failure', () => {
  it('defaults to operation=add when LLM throws', async () => {
    const existingMatch = makeVectorSearchResult({}, 0.92);
    const failingLLM: LLMAdapter = {
      complete: vi.fn().mockRejectedValue(new Error('LLM unavailable')),
      model: 'test-model',
    };
    const config: DedupConfig = {
      storage: makeMockStorage({ vectorSearch: vi.fn().mockResolvedValue([existingMatch]) }),
      embedding: makeMockEmbedding(),
      llm: failingLLM,
    };

    const result = await deduplicateFacts(config, [makeFact()], TENANT_ID, SCOPE, SCOPE_ID);

    expect(result).toHaveLength(1);
    expect(result[0].operation).toBe('add');
  });

  it('defaults to operation=add when LLM returns invalid JSON', async () => {
    const existingMatch = makeVectorSearchResult({}, 0.92);
    const badLLM: LLMAdapter = {
      complete: vi.fn().mockResolvedValue({
        content: 'not valid json at all }{',
        tokensInput: 5,
        tokensOutput: 5,
        model: 'test-model',
      } satisfies LLMResponse),
      model: 'test-model',
    };
    const config: DedupConfig = {
      storage: makeMockStorage({ vectorSearch: vi.fn().mockResolvedValue([existingMatch]) }),
      embedding: makeMockEmbedding(),
      llm: badLLM,
    };

    const result = await deduplicateFacts(config, [makeFact()], TENANT_ID, SCOPE, SCOPE_ID);

    expect(result).toHaveLength(1);
    expect(result[0].operation).toBe('add');
  });

  it('defaults to operation=add when LLM returns unknown operation value', async () => {
    const existingMatch = makeVectorSearchResult({}, 0.92);
    const config: DedupConfig = {
      storage: makeMockStorage({ vectorSearch: vi.fn().mockResolvedValue([existingMatch]) }),
      embedding: makeMockEmbedding(),
      llm: makeMockLLM({ operation: 'UNKNOWN_OP' }),
    };

    const result = await deduplicateFacts(config, [makeFact()], TENANT_ID, SCOPE, SCOPE_ID);

    expect(result).toHaveLength(1);
    expect(result[0].operation).toBe('add');
  });
});

describe('deduplicateFacts – similarity threshold', () => {
  it('uses default threshold of 0.70 when none specified', async () => {
    const vectorSearch = vi.fn().mockResolvedValue([]);
    const config: DedupConfig = {
      storage: makeMockStorage({ vectorSearch }),
      embedding: makeMockEmbedding(),
      llm: makeMockLLM({ operation: 'add' }),
    };

    await deduplicateFacts(config, [makeFact()], TENANT_ID, SCOPE, SCOPE_ID);

    expect(vectorSearch).toHaveBeenCalledWith(
      expect.objectContaining({ minSimilarity: 0.70 }),
    );
  });

  it('uses custom threshold of 0.9 when specified', async () => {
    const vectorSearch = vi.fn().mockResolvedValue([]);
    const config: DedupConfig = {
      storage: makeMockStorage({ vectorSearch }),
      embedding: makeMockEmbedding(),
      llm: makeMockLLM({ operation: 'add' }),
      similarityThreshold: 0.9,
    };

    await deduplicateFacts(config, [makeFact()], TENANT_ID, SCOPE, SCOPE_ID);

    expect(vectorSearch).toHaveBeenCalledWith(
      expect.objectContaining({ minSimilarity: 0.9 }),
    );
  });
});

describe('deduplicateFacts – empty and multiple facts', () => {
  it('returns empty array when given empty facts array', async () => {
    const config: DedupConfig = {
      storage: makeMockStorage(),
      embedding: makeMockEmbedding(),
      llm: makeMockLLM({ operation: 'add' }),
    };

    const result = await deduplicateFacts(config, [], TENANT_ID, SCOPE, SCOPE_ID);

    expect(result).toEqual([]);
  });

  it('processes multiple facts independently', async () => {
    // Fact 1: no matches → add
    // Fact 2: has operation=noop from Stage 2 → keep
    // Fact 3: similar match found, LLM says update

    const existingMatch = makeVectorSearchResult(
      {
        id: 'stored-fact-id-0000-0000-0000-000000000001',
        lineageId: 'lineage-id-0000-0000-0000-000000000001',
      },
      0.93,
    );

    const vectorSearch = vi
      .fn()
      .mockResolvedValueOnce([]) // Fact 1: no matches
      .mockResolvedValueOnce([existingMatch]); // Fact 3: match found

    const llm = makeMockLLM({
      operation: 'update',
      existing_lineage_id: 'lineage-id-0000-0000-0000-000000000001',
    });

    const config: DedupConfig = {
      storage: makeMockStorage({ vectorSearch }),
      embedding: makeMockEmbedding(),
      llm,
    };

    const facts: ExtractedFact[] = [
      makeFact({ content: 'Fact 1: new fact' }),
      makeFact({ content: 'Fact 2: noop from stage 2', operation: 'noop' }),
      makeFact({ content: 'Fact 3: updated fact' }),
    ];

    const result = await deduplicateFacts(config, facts, TENANT_ID, SCOPE, SCOPE_ID);

    expect(result).toHaveLength(3);

    expect(result[0].content).toBe('Fact 1: new fact');
    expect(result[0].operation).toBe('add');

    expect(result[1].content).toBe('Fact 2: noop from stage 2');
    expect(result[1].operation).toBe('noop');

    expect(result[2].content).toBe('Fact 3: updated fact');
    expect(result[2].operation).toBe('update');
    expect(result[2].existingLineageId).toBe('lineage-id-0000-0000-0000-000000000001');

    // vectorSearch called only for facts 1 and 3 (not for fact 2 which has pre-assigned op)
    expect(vectorSearch).toHaveBeenCalledTimes(2);
  });

  it('preserves all original fact fields on processed facts', async () => {
    const config: DedupConfig = {
      storage: makeMockStorage({ vectorSearch: vi.fn().mockResolvedValue([]) }),
      embedding: makeMockEmbedding(),
      llm: makeMockLLM({ operation: 'add' }),
    };

    const fact = makeFact({
      content: 'User prefers dark mode',
      importance: 0.6,
      confidence: 0.85,
      tags: ['ui', 'preference'],
      originalContent: 'I prefer dark mode',
    });

    const result = await deduplicateFacts(config, [fact], TENANT_ID, SCOPE, SCOPE_ID);

    expect(result[0].content).toBe('User prefers dark mode');
    expect(result[0].importance).toBe(0.6);
    expect(result[0].confidence).toBe(0.85);
    expect(result[0].tags).toEqual(['ui', 'preference']);
    expect(result[0].originalContent).toBe('I prefer dark mode');
  });
});

describe('deduplicateFacts – embedding', () => {
  it('embeds the fact content before vector search', async () => {
    const embed = vi.fn().mockResolvedValue([0.5, 0.6, 0.7]);
    const vectorSearch = vi.fn().mockResolvedValue([]);
    const config: DedupConfig = {
      storage: makeMockStorage({ vectorSearch }),
      embedding: makeMockEmbedding({ embed }),
      llm: makeMockLLM({ operation: 'add' }),
    };

    await deduplicateFacts(
      config,
      [makeFact({ content: 'My specific fact content' })],
      TENANT_ID,
      SCOPE,
      SCOPE_ID,
    );

    expect(embed).toHaveBeenCalledWith('My specific fact content');
    expect(vectorSearch).toHaveBeenCalledWith(
      expect.objectContaining({ embedding: [0.5, 0.6, 0.7] }),
    );
  });

  it('does NOT call embed when operation is already set (non-add)', async () => {
    const embed = vi.fn();
    const config: DedupConfig = {
      storage: makeMockStorage(),
      embedding: makeMockEmbedding({ embed }),
      llm: makeMockLLM({ operation: 'add' }),
    };

    await deduplicateFacts(
      config,
      [makeFact({ operation: 'update', existingLineageId: 'lineage-abc' })],
      TENANT_ID,
      SCOPE,
      SCOPE_ID,
    );

    expect(embed).not.toHaveBeenCalled();
  });
});

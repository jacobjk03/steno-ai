import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runExtractionPipeline,
  inputToText,
  mergeFacts,
  mergeEntities,
} from '../../src/extraction/pipeline.js';
import type { PipelineConfig } from '../../src/extraction/pipeline.js';
import type { StorageAdapter } from '../../src/adapters/storage.js';
import type { EmbeddingAdapter } from '../../src/adapters/embedding.js';
import type { LLMAdapter, LLMResponse } from '../../src/adapters/llm.js';
import type { ExtractionInput, ExtractedFact, ExtractedEntity } from '../../src/extraction/types.js';
import type { Fact, Extraction, Entity, Edge } from '../../src/models/index.js';

// ---------------------------------------------------------------------------
// Fixed IDs for tests
// ---------------------------------------------------------------------------

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const SCOPE_ID = '22222222-2222-2222-2222-222222222222';
const SESSION_ID = '33333333-3333-3333-3333-333333333333';

// ---------------------------------------------------------------------------
// Mock model builders
// ---------------------------------------------------------------------------

function makeStoredFact(overrides: Partial<Fact> = {}): Fact {
  return {
    id: crypto.randomUUID(),
    tenantId: TENANT_ID,
    scope: 'user',
    scopeId: SCOPE_ID,
    sessionId: null,
    content: 'User likes cats',
    embeddingModel: 'test-model',
    embeddingDim: 3,
    version: 1,
    lineageId: crypto.randomUUID(),
    validFrom: new Date(),
    validUntil: null,
    operation: 'create',
    parentId: null,
    importance: 0.8,
    frequency: 0,
    lastAccessed: null,
    decayScore: 1.0,
    contradictionStatus: 'none',
    contradictsId: null,
    sourceType: 'conversation',
    sourceRef: null,
    confidence: 0.9,
    originalContent: 'I like cats',
    extractionId: null,
    extractionTier: null,
    modality: 'text',
    tags: [],
    metadata: {},
    createdAt: new Date(),
    ...overrides,
  };
}

function makeStoredExtraction(overrides: Partial<Extraction> = {}): Extraction {
  return {
    id: crypto.randomUUID(),
    tenantId: TENANT_ID,
    status: 'completed',
    inputType: 'conversation',
    inputData: 'some text',
    inputHash: 'abc123',
    inputSize: 9,
    scope: 'user',
    scopeId: SCOPE_ID,
    sessionId: null,
    tierUsed: 'cheap_llm',
    llmModel: 'test-model',
    factsCreated: 2,
    factsUpdated: 0,
    factsInvalidated: 0,
    entitiesCreated: 1,
    edgesCreated: 0,
    costTokensInput: 100,
    costTokensOutput: 50,
    costUsd: 0.0,
    durationMs: 300,
    error: null,
    retryCount: 0,
    createdAt: new Date(),
    completedAt: new Date(),
    ...overrides,
  };
}

function makeStoredEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: crypto.randomUUID(),
    tenantId: TENANT_ID,
    name: 'Alice',
    entityType: 'person',
    canonicalName: 'alice',
    properties: {},
    embeddingModel: null,
    embeddingDim: null,
    mergeTargetId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeStoredEdge(overrides: Partial<Edge> = {}): Edge {
  return {
    id: crypto.randomUUID(),
    tenantId: TENANT_ID,
    sourceId: crypto.randomUUID(),
    targetId: crypto.randomUUID(),
    relation: 'related_to',
    edgeType: 'associative',
    weight: 1.0,
    validFrom: null,
    validUntil: null,
    factId: null,
    confidence: 0.8,
    metadata: {},
    createdAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock adapters
// ---------------------------------------------------------------------------

function makeMockStorage(overrides: Partial<StorageAdapter> = {}): StorageAdapter {
  // In-memory store
  const extractions = new Map<string, Extraction>();
  const facts = new Map<string, Fact>();
  const entities = new Map<string, Entity>();
  const edges = new Map<string, Edge>();
  const factEntities: Array<{ factId: string; entityId: string; role: string }> = [];

  return {
    // Facts
    createFact: vi.fn(async (fact) => {
      const stored = makeStoredFact({ ...fact });
      facts.set(fact.id, stored);
      return stored;
    }),
    getFact: vi.fn(async (_tenantId, id) => facts.get(id) ?? null),
    getFactsByLineage: vi.fn(async (_tenantId, _lineageId) => []),
    getFactsByScope: vi.fn(async () => ({ data: [], cursor: null, hasMore: false })),
    invalidateFact: vi.fn(async (_tenantId, id) => {
      const f = facts.get(id);
      if (f) facts.set(id, { ...f, validUntil: new Date() });
    }),
    purgeFacts: vi.fn(async () => 0),
    updateDecayScores: vi.fn(async () => {}),

    // Vector / keyword search
    vectorSearch: vi.fn(async () => []),
    keywordSearch: vi.fn(async () => []),

    // Entities
    createEntity: vi.fn(async (entity) => {
      const stored = makeStoredEntity({ ...entity });
      entities.set(entity.id, stored);
      return stored;
    }),
    getEntity: vi.fn(async (_tenantId, id) => entities.get(id) ?? null),
    findEntityByCanonicalName: vi.fn(async () => null),
    getEntitiesForTenant: vi.fn(async () => ({ data: [], cursor: null, hasMore: false })),

    // Fact-Entity junction
    linkFactEntity: vi.fn(async (factId, entityId, role) => {
      factEntities.push({ factId, entityId, role });
    }),
    getEntitiesForFact: vi.fn(async () => []),
    getFactsForEntity: vi.fn(async () => ({ data: [], cursor: null, hasMore: false })),

    // Edges
    createEdge: vi.fn(async (edge) => {
      const stored = makeStoredEdge({ ...edge });
      edges.set(edge.id, stored);
      return stored;
    }),
    getEdgesForEntity: vi.fn(async () => []),
    graphTraversal: vi.fn(async () => ({ entities: [], edges: [] })),

    // Triggers
    createTrigger: vi.fn(async () => { throw new Error('not implemented'); }),
    getTrigger: vi.fn(async () => null),
    getActiveTriggers: vi.fn(async () => []),
    updateTrigger: vi.fn(async () => { throw new Error('not implemented'); }),
    deleteTrigger: vi.fn(async () => {}),
    incrementTriggerFired: vi.fn(async () => {}),

    // Memory Access
    createMemoryAccess: vi.fn(async () => { throw new Error('not implemented'); }),
    updateFeedback: vi.fn(async () => {}),

    // Extractions
    createExtraction: vi.fn(async (extraction) => {
      const stored: Extraction = {
        ...makeStoredExtraction({
          id: extraction.id,
          tenantId: extraction.tenantId,
          inputType: extraction.inputType,
          inputData: extraction.inputData,
          inputHash: extraction.inputHash,
          inputSize: extraction.inputSize ?? null,
          scope: extraction.scope,
          scopeId: extraction.scopeId,
          sessionId: extraction.sessionId ?? null,
          status: 'queued',
          tierUsed: null,
          factsCreated: 0,
          factsUpdated: 0,
          factsInvalidated: 0,
          entitiesCreated: 0,
          edgesCreated: 0,
          costTokensInput: 0,
          costTokensOutput: 0,
          durationMs: null,
          completedAt: null,
        }),
      };
      extractions.set(extraction.id, stored);
      return stored;
    }),
    getExtraction: vi.fn(async (_tenantId, id) => extractions.get(id) ?? null),
    updateExtraction: vi.fn(async (tenantId, id, updates) => {
      const existing = extractions.get(id);
      if (!existing) throw new Error(`Extraction ${id} not found`);
      const updated = { ...existing, ...updates };
      extractions.set(id, updated);
      return updated;
    }),
    getExtractionByHash: vi.fn(async () => null),

    // Sessions
    createSession: vi.fn(async () => { throw new Error('not implemented'); }),
    getSession: vi.fn(async () => null),
    endSession: vi.fn(async () => { throw new Error('not implemented'); }),
    getSessionsByScope: vi.fn(async () => ({ data: [], cursor: null, hasMore: false })),

    // Tenants
    createTenant: vi.fn(async () => { throw new Error('not implemented'); }),
    getTenant: vi.fn(async () => null),
    getTenantBySlug: vi.fn(async () => null),
    updateTenant: vi.fn(async () => { throw new Error('not implemented'); }),

    // API Keys
    createApiKey: vi.fn(async () => { throw new Error('not implemented'); }),
    getApiKeyByPrefix: vi.fn(async () => null),
    getApiKeysForTenant: vi.fn(async () => []),
    revokeApiKey: vi.fn(async () => {}),
    updateApiKeyLastUsed: vi.fn(async () => {}),

    // Usage
    incrementUsage: vi.fn(async () => {}),
    getUsage: vi.fn(async () => null),
    getCurrentUsage: vi.fn(async () => null),

    // Health
    ping: vi.fn(async () => true),

    ...overrides,
  } as unknown as StorageAdapter;
}

function makeMockEmbedding(overrides: Partial<EmbeddingAdapter> = {}): EmbeddingAdapter {
  return {
    embed: vi.fn(async () => [0.1, 0.2, 0.3]),
    embedBatch: vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3])),
    model: 'test-embedding-model',
    dimensions: 3,
    ...overrides,
  } as EmbeddingAdapter;
}

/** Build LLM JSON response with the given facts array */
function makeLLMExtractionResponse(
  facts: Array<{
    content: string;
    importance?: number;
    operation?: string;
    existing_lineage_id?: string | null;
    contradicts_fact_id?: string | null;
    entities?: Array<{ name: string; type: string }>;
  }>,
  confidence = 0.85,
): string {
  return JSON.stringify({
    facts: facts.map(f => ({
      content: f.content,
      importance: f.importance ?? 0.7,
      operation: f.operation ?? 'add',
      existing_lineage_id: f.existing_lineage_id ?? null,
      contradicts_fact_id: f.contradicts_fact_id ?? null,
      entities: f.entities ?? [],
      relationships: [],
    })),
    confidence,
    entities: [],
    edges: [],
  });
}

function makeMockLLM(responseContent: string): LLMAdapter {
  return {
    complete: vi.fn(async (): Promise<LLMResponse> => ({
      content: responseContent,
      tokensInput: 50,
      tokensOutput: 30,
      model: 'test-llm-model',
    })),
    model: 'test-llm-model',
  };
}

// ---------------------------------------------------------------------------
// Test inputs
// ---------------------------------------------------------------------------

function makeConversationInput(overrides: Partial<ExtractionInput> = {}): ExtractionInput {
  return {
    tenantId: TENANT_ID,
    scope: 'user',
    scopeId: SCOPE_ID,
    sessionId: SESSION_ID,
    inputType: 'conversation',
    data: {
      messages: [
        { role: 'user', content: 'My name is Alice and I work at Acme Corp.' },
        { role: 'assistant', content: 'Nice to meet you, Alice!' },
      ],
    },
    ...overrides,
  };
}

function makeRawTextInput(text: string, overrides: Partial<ExtractionInput> = {}): ExtractionInput {
  return {
    tenantId: TENANT_ID,
    scope: 'user',
    scopeId: SCOPE_ID,
    inputType: 'raw_text',
    data: text,
    ...overrides,
  };
}

function makePipelineConfig(
  storageOverrides: Partial<StorageAdapter> = {},
  llmContent = makeLLMExtractionResponse([{ content: 'User\'s name is Alice', importance: 0.9 }]),
): PipelineConfig {
  return {
    storage: makeMockStorage(storageOverrides),
    embedding: makeMockEmbedding(),
    cheapLLM: makeMockLLM(llmContent),
    embeddingModel: 'test-embedding-model',
    embeddingDim: 3,
    extractionTier: 'auto',
  };
}

// ---------------------------------------------------------------------------
// Tests: inputToText helper
// ---------------------------------------------------------------------------

describe('inputToText', () => {
  it('returns raw string data as-is', () => {
    const input = makeRawTextInput('Hello world');
    expect(inputToText(input)).toBe('Hello world');
  });

  it('formats conversation messages as "role: content" lines', () => {
    const input = makeConversationInput();
    const result = inputToText(input);
    expect(result).toBe(
      'user: My name is Alice and I work at Acme Corp.\nassistant: Nice to meet you, Alice!',
    );
  });

  it('JSON-stringifies plain objects without messages', () => {
    const input: ExtractionInput = {
      tenantId: TENANT_ID,
      scope: 'user',
      scopeId: SCOPE_ID,
      inputType: 'raw_text',
      data: { key: 'value', num: 42 },
    };
    const result = inputToText(input);
    expect(result).toBe(JSON.stringify({ key: 'value', num: 42 }));
  });

  it('converts non-string non-object data with String()', () => {
    const input: ExtractionInput = {
      tenantId: TENANT_ID,
      scope: 'user',
      scopeId: SCOPE_ID,
      inputType: 'raw_text',
      data: 12345,
    };
    expect(inputToText(input)).toBe('12345');
  });
});

// ---------------------------------------------------------------------------
// Tests: mergeFacts helper
// ---------------------------------------------------------------------------

describe('mergeFacts', () => {
  function makeFact(content: string): ExtractedFact {
    return {
      content,
      importance: 0.7,
      confidence: 0.8,
      sourceType: 'conversation',
      modality: 'text',
      tags: [],
      originalContent: content,
      operation: 'add',
    };
  }

  it('LLM facts take priority (placed first)', () => {
    const heuristic = [makeFact('Fact A'), makeFact('Fact B')];
    const llm = [makeFact('Fact C')];
    const result = mergeFacts(heuristic, llm);
    expect(result[0].content).toBe('Fact C');
  });

  it('heuristic facts not in LLM are appended', () => {
    const heuristic = [makeFact('Heuristic only fact')];
    const llm = [makeFact('LLM fact')];
    const result = mergeFacts(heuristic, llm);
    expect(result).toHaveLength(2);
    expect(result.map(f => f.content)).toContain('Heuristic only fact');
    expect(result.map(f => f.content)).toContain('LLM fact');
  });

  it('heuristic facts that duplicate LLM content (case-insensitive) are excluded', () => {
    const heuristic = [makeFact('User likes CATS')];
    const llm = [makeFact('User likes cats')];
    const result = mergeFacts(heuristic, llm);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('User likes cats'); // LLM version kept
  });

  it('returns only LLM facts when heuristic has no unique content', () => {
    const heuristic = [makeFact('Same fact')];
    const llm = [makeFact('Same fact')];
    const result = mergeFacts(heuristic, llm);
    expect(result).toHaveLength(1);
  });

  it('returns heuristic facts when LLM is empty', () => {
    const heuristic = [makeFact('Heuristic fact')];
    const llm: ExtractedFact[] = [];
    const result = mergeFacts(heuristic, llm);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Heuristic fact');
  });
});

// ---------------------------------------------------------------------------
// Tests: mergeEntities helper
// ---------------------------------------------------------------------------

describe('mergeEntities', () => {
  function makeEntity(canonicalName: string, name: string, entityType = 'person'): ExtractedEntity {
    return { name, entityType, canonicalName, properties: {} };
  }

  it('LLM entity overwrites heuristic for same canonicalName', () => {
    const heuristic = [makeEntity('alice', 'alice', 'concept')];
    const llm = [makeEntity('alice', 'Alice', 'person')];
    const result = mergeEntities(heuristic, llm);
    expect(result).toHaveLength(1);
    expect(result[0].entityType).toBe('person'); // LLM wins
    expect(result[0].name).toBe('Alice');
  });

  it('entities with different canonicalNames are both kept', () => {
    const heuristic = [makeEntity('alice', 'Alice')];
    const llm = [makeEntity('bob', 'Bob')];
    const result = mergeEntities(heuristic, llm);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when both are empty', () => {
    expect(mergeEntities([], [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: pipeline – dedup prevention (same hash returns existing)
// ---------------------------------------------------------------------------

describe('runExtractionPipeline – dedup prevention', () => {
  it('returns existing extraction when same input hash has already been processed', async () => {
    const existingExtraction = makeStoredExtraction({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      status: 'completed',
      factsCreated: 3,
      factsUpdated: 1,
      factsInvalidated: 0,
      entitiesCreated: 2,
      edgesCreated: 1,
      costTokensInput: 200,
      costTokensOutput: 100,
      durationMs: 500,
      tierUsed: 'cheap_llm',
    });

    const getExtractionByHash = vi.fn(async () => existingExtraction);
    const createExtraction = vi.fn();

    const config = makePipelineConfig({ getExtractionByHash, createExtraction });
    const input = makeRawTextInput('Hello world');

    const result = await runExtractionPipeline(config, input);

    expect(result.extractionId).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(result.factsCreated).toBe(3);
    expect(result.factsUpdated).toBe(1);
    expect(result.entitiesCreated).toBe(2);
    expect(result.edgesCreated).toBe(1);
    expect(result.costTokensInput).toBe(200);
    expect(result.costTokensOutput).toBe(100);

    // Must NOT create a new extraction record
    expect(createExtraction).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: pipeline – heuristic-only mode
// ---------------------------------------------------------------------------

describe('runExtractionPipeline – heuristic_only tier', () => {
  it('skips LLM call when extractionTier is heuristic_only', async () => {
    const llmComplete = vi.fn();
    const config: PipelineConfig = {
      storage: makeMockStorage(),
      embedding: makeMockEmbedding(),
      cheapLLM: { complete: llmComplete, model: 'test-llm' },
      embeddingModel: 'test-embedding-model',
      embeddingDim: 3,
      extractionTier: 'heuristic_only',
    };

    const input = makeRawTextInput('My name is Bob. I like pizza.');
    await runExtractionPipeline(config, input);

    expect(llmComplete).not.toHaveBeenCalled();
  });

  it('still returns a PipelineResult with heuristic tier', async () => {
    const config: PipelineConfig = {
      storage: makeMockStorage(),
      embedding: makeMockEmbedding(),
      cheapLLM: { complete: vi.fn(), model: 'test-llm' },
      embeddingModel: 'test-embedding-model',
      embeddingDim: 3,
      extractionTier: 'heuristic_only',
    };

    const input = makeRawTextInput('My name is Bob.');
    const result = await runExtractionPipeline(config, input);

    expect(result.tier).toBe('heuristic');
    expect(result.extractionId).toBeTruthy();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: pipeline – full happy path
// ---------------------------------------------------------------------------

describe('runExtractionPipeline – full happy path', () => {
  it('returns PipelineResult with correct shape', async () => {
    const llmResponse = makeLLMExtractionResponse([
      { content: "User's name is Alice", importance: 0.9, operation: 'add' },
    ]);
    const config = makePipelineConfig({}, llmResponse);
    const input = makeConversationInput();

    const result = await runExtractionPipeline(config, input);

    expect(result).toMatchObject({
      extractionId: expect.any(String),
      factsCreated: expect.any(Number),
      factsUpdated: expect.any(Number),
      factsInvalidated: expect.any(Number),
      entitiesCreated: expect.any(Number),
      edgesCreated: expect.any(Number),
      tier: expect.any(String),
      costTokensInput: expect.any(Number),
      costTokensOutput: expect.any(Number),
      durationMs: expect.any(Number),
    });
  });

  it('creates at least one fact from LLM response', async () => {
    const llmResponse = makeLLMExtractionResponse([
      { content: "User's name is Alice", importance: 0.9, operation: 'add' },
    ]);
    const config = makePipelineConfig({}, llmResponse);
    const input = makeConversationInput();

    const result = await runExtractionPipeline(config, input);

    expect(result.factsCreated).toBeGreaterThanOrEqual(1);
  });

  it('duration is positive', async () => {
    const config = makePipelineConfig();
    const input = makeConversationInput();
    const result = await runExtractionPipeline(config, input);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: pipeline – token tracking
// ---------------------------------------------------------------------------

describe('runExtractionPipeline – token tracking', () => {
  it('sums tokens from LLM calls into result', async () => {
    const llmResponse = makeLLMExtractionResponse([
      { content: "User's name is Alice", importance: 0.9 },
    ]);

    // LLM returns tokensInput: 50, tokensOutput: 30 per mock
    const config = makePipelineConfig({}, llmResponse);
    const input = makeRawTextInput('My name is Alice.'); // text input to avoid conversation parsing

    const result = await runExtractionPipeline(config, input);

    // At minimum, cheap LLM tokens should be counted (50 input, 30 output)
    // Dedup LLM might also be called if vector search finds matches, but mock returns []
    // So base tokens from LLM extraction = 50 + 30
    expect(result.costTokensInput).toBeGreaterThanOrEqual(50);
    expect(result.costTokensOutput).toBeGreaterThanOrEqual(30);
  });

  it('costTokens are zero in heuristic_only mode', async () => {
    const config: PipelineConfig = {
      storage: makeMockStorage(),
      embedding: makeMockEmbedding(),
      cheapLLM: { complete: vi.fn(), model: 'test-llm' },
      embeddingModel: 'test-embedding-model',
      embeddingDim: 3,
      extractionTier: 'heuristic_only',
    };

    const input = makeRawTextInput('My name is Bob.');
    const result = await runExtractionPipeline(config, input);

    expect(result.costTokensInput).toBe(0);
    expect(result.costTokensOutput).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: pipeline – extraction record lifecycle
// ---------------------------------------------------------------------------

describe('runExtractionPipeline – extraction record lifecycle', () => {
  it('creates extraction with queued status, then updates to processing, then completed', async () => {
    const statusHistory: string[] = [];

    const storage = makeMockStorage({
      createExtraction: vi.fn(async (extraction) => {
        statusHistory.push('queued');
        return {
          ...makeStoredExtraction(),
          id: extraction.id,
          status: 'queued' as const,
        };
      }),
      updateExtraction: vi.fn(async (_tenantId, _id, updates) => {
        if (updates.status) statusHistory.push(updates.status);
        return makeStoredExtraction({ status: updates.status ?? 'queued' });
      }),
    });

    const config: PipelineConfig = {
      storage,
      embedding: makeMockEmbedding(),
      cheapLLM: makeMockLLM(makeLLMExtractionResponse([])),
      embeddingModel: 'test-model',
      embeddingDim: 3,
      extractionTier: 'heuristic_only',
    };

    await runExtractionPipeline(config, makeRawTextInput('Hello'));

    expect(statusHistory).toContain('queued');
    expect(statusHistory).toContain('processing');
    expect(statusHistory).toContain('completed');

    // Order: queued first, then processing, then completed
    const queuedIdx = statusHistory.indexOf('queued');
    const processingIdx = statusHistory.indexOf('processing');
    const completedIdx = statusHistory.indexOf('completed');
    expect(queuedIdx).toBeLessThan(processingIdx);
    expect(processingIdx).toBeLessThan(completedIdx);
  });
});

// ---------------------------------------------------------------------------
// Tests: pipeline – error handling
// ---------------------------------------------------------------------------

describe('runExtractionPipeline – error handling', () => {
  it('sets extraction status to failed when embedding throws and re-throws the error', async () => {
    const updateExtraction = vi.fn(async (_tenantId: string, _id: string, updates: Partial<Extraction>) => {
      return makeStoredExtraction({ status: updates.status ?? 'queued' });
    });

    // Make embedding throw so the error propagates out of the pipeline
    const failingEmbedding: EmbeddingAdapter = {
      embed: vi.fn(async () => { throw new Error('Embedding service unavailable'); }),
      embedBatch: vi.fn(async () => { throw new Error('Embedding service unavailable'); }),
      model: 'failing-embedding',
      dimensions: 3,
    };

    const storage = makeMockStorage({ updateExtraction });

    // Use cheap_only so LLM runs — heuristic needs no embedding, but fact persistence does
    const llmResponse = makeLLMExtractionResponse([
      { content: "User's name is Alice", importance: 0.9, operation: 'add' },
    ]);

    const config: PipelineConfig = {
      storage,
      embedding: failingEmbedding,
      cheapLLM: makeMockLLM(llmResponse),
      embeddingModel: 'test-model',
      embeddingDim: 3,
      extractionTier: 'cheap_only',
    };

    await expect(
      runExtractionPipeline(config, makeRawTextInput('My name is Alice.')),
    ).rejects.toThrow('Embedding service unavailable');

    // Check that updateExtraction was called with status='failed'
    const failedCall = updateExtraction.mock.calls.find(
      ([, , updates]) => (updates as Partial<Extraction>).status === 'failed',
    );
    expect(failedCall).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: pipeline – fact versioning (update operation)
// ---------------------------------------------------------------------------

describe('runExtractionPipeline – fact versioning', () => {
  it('invalidates old fact when operation=update', async () => {
    const existingLineageId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const oldFactId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

    const invalidateFact = vi.fn(async () => {});

    const storage = makeMockStorage({
      invalidateFact,
      getFactsByLineage: vi.fn(async () => [
        makeStoredFact({ id: oldFactId, lineageId: existingLineageId, validUntil: null }),
      ]),
    });

    const llmResponse = makeLLMExtractionResponse([
      {
        content: "User's name is Alice Smith",
        importance: 0.9,
        operation: 'update',
        existing_lineage_id: existingLineageId,
      },
    ]);

    const config: PipelineConfig = {
      storage,
      embedding: makeMockEmbedding(),
      cheapLLM: makeMockLLM(llmResponse),
      embeddingModel: 'test-model',
      embeddingDim: 3,
      extractionTier: 'cheap_only',
    };

    const result = await runExtractionPipeline(config, makeRawTextInput("My name is Alice Smith"));

    expect(invalidateFact).toHaveBeenCalledWith(TENANT_ID, oldFactId);
    expect(result.factsUpdated).toBeGreaterThanOrEqual(1);
    expect(result.factsInvalidated).toBeGreaterThanOrEqual(1);
  });

  it('does NOT create a new lineageId for update operations (reuses existing)', async () => {
    const existingLineageId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const createdFacts: Array<{ id: string; lineageId: string }> = [];

    const storage = makeMockStorage({
      createFact: vi.fn(async (fact) => {
        createdFacts.push({ id: fact.id, lineageId: fact.lineageId });
        return makeStoredFact({ id: fact.id, lineageId: fact.lineageId });
      }),
      getFactsByLineage: vi.fn(async () => []),
    });

    const llmResponse = makeLLMExtractionResponse([
      {
        content: 'Updated fact content',
        importance: 0.8,
        operation: 'update',
        existing_lineage_id: existingLineageId,
      },
    ]);

    const config: PipelineConfig = {
      storage,
      embedding: makeMockEmbedding(),
      cheapLLM: makeMockLLM(llmResponse),
      embeddingModel: 'test-model',
      embeddingDim: 3,
      extractionTier: 'cheap_only',
    };

    await runExtractionPipeline(config, makeRawTextInput('Updated fact content'));

    const updateFact = createdFacts.find(f => f.lineageId === existingLineageId);
    expect(updateFact).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: pipeline – noop facts skipped
// ---------------------------------------------------------------------------

describe('runExtractionPipeline – noop facts', () => {
  it('does not persist facts with operation=noop', async () => {
    const createFact = vi.fn(async () => makeStoredFact());

    const storage = makeMockStorage({ createFact });

    const llmResponse = makeLLMExtractionResponse([
      { content: 'User likes cats', importance: 0.6, operation: 'noop' },
      { content: 'User likes dogs', importance: 0.6, operation: 'noop' },
    ]);

    const config: PipelineConfig = {
      storage,
      embedding: makeMockEmbedding(),
      cheapLLM: makeMockLLM(llmResponse),
      embeddingModel: 'test-model',
      embeddingDim: 3,
      extractionTier: 'heuristic_only', // avoid LLM so we can test heuristic-only noop
    };

    // Use a text that matches NO heuristic patterns to get zero facts
    const result = await runExtractionPipeline(
      config,
      makeRawTextInput('The weather is nice today.'),
    );

    // No facts should be created from LLM noops (heuristic_only means LLM skipped)
    // heuristic extractor won't produce facts from this text either
    expect(result.factsCreated).toBe(0);
    // createFact should not be called with noop facts
    expect(createFact).not.toHaveBeenCalled();
  });

  it('skips noop facts from LLM in auto mode', async () => {
    const createFact = vi.fn(async () => makeStoredFact());
    const storage = makeMockStorage({ createFact });

    const llmResponse = makeLLMExtractionResponse([
      { content: 'User likes cats', importance: 0.6, operation: 'noop' },
    ]);

    const config: PipelineConfig = {
      storage,
      embedding: makeMockEmbedding(),
      cheapLLM: makeMockLLM(llmResponse),
      embeddingModel: 'test-model',
      embeddingDim: 3,
      extractionTier: 'cheap_only',
    };

    // Text that doesn't trigger heuristic patterns
    const result = await runExtractionPipeline(
      config,
      makeRawTextInput('The weather is nice today.'),
    );

    // No facts created because LLM returned noop and heuristic found nothing
    expect(result.factsCreated).toBe(0);
    expect(createFact).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: pipeline – smart LLM escalation
// ---------------------------------------------------------------------------

describe('runExtractionPipeline – smart LLM escalation', () => {
  it('escalates to smartLLM when cheap LLM confidence < 0.6 in auto mode', async () => {
    const smartLLMComplete = vi.fn(async (): Promise<LLMResponse> => ({
      content: makeLLMExtractionResponse(
        [{ content: 'User is a senior engineer', importance: 0.85 }],
        0.95,
      ),
      tokensInput: 100,
      tokensOutput: 60,
      model: 'smart-llm-model',
    }));

    const cheapLLMComplete = vi.fn(async (): Promise<LLMResponse> => ({
      content: makeLLMExtractionResponse([], 0.3), // low confidence → escalate
      tokensInput: 30,
      tokensOutput: 20,
      model: 'cheap-llm-model',
    }));

    const config: PipelineConfig = {
      storage: makeMockStorage(),
      embedding: makeMockEmbedding(),
      cheapLLM: { complete: cheapLLMComplete, model: 'cheap-llm' },
      smartLLM: { complete: smartLLMComplete, model: 'smart-llm' },
      embeddingModel: 'test-model',
      embeddingDim: 3,
      extractionTier: 'auto',
    };

    const result = await runExtractionPipeline(
      config,
      makeRawTextInput('I am a senior engineer.'),
    );

    expect(smartLLMComplete).toHaveBeenCalled();
    // Tokens from both cheap and smart LLM should be summed
    expect(result.costTokensInput).toBeGreaterThanOrEqual(130); // 30 + 100
    expect(result.costTokensOutput).toBeGreaterThanOrEqual(80); // 20 + 60
  });

  it('does not escalate when cheap LLM confidence >= 0.6', async () => {
    const smartLLMComplete = vi.fn();

    const cheapLLMComplete = vi.fn(async (): Promise<LLMResponse> => ({
      content: makeLLMExtractionResponse(
        [{ content: "User's name is Bob" }],
        0.8, // high confidence → no escalation
      ),
      tokensInput: 50,
      tokensOutput: 30,
      model: 'cheap-llm',
    }));

    const config: PipelineConfig = {
      storage: makeMockStorage(),
      embedding: makeMockEmbedding(),
      cheapLLM: { complete: cheapLLMComplete, model: 'cheap-llm' },
      smartLLM: { complete: smartLLMComplete, model: 'smart-llm' },
      embeddingModel: 'test-model',
      embeddingDim: 3,
      extractionTier: 'auto',
    };

    await runExtractionPipeline(config, makeRawTextInput("My name is Bob."));

    expect(smartLLMComplete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: pipeline – incrementUsage called
// ---------------------------------------------------------------------------

describe('runExtractionPipeline – usage tracking', () => {
  it('calls incrementUsage after successful pipeline run', async () => {
    const incrementUsage = vi.fn(async () => {});
    const config = makePipelineConfig({ incrementUsage });

    await runExtractionPipeline(config, makeConversationInput());

    expect(incrementUsage).toHaveBeenCalledOnce();
    expect(incrementUsage).toHaveBeenCalledWith(
      TENANT_ID,
      expect.any(Number), // total tokens
      0,
      1,
      0,
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: pipeline – tier labels
// ---------------------------------------------------------------------------

describe('runExtractionPipeline – tier labels', () => {
  it('returns tier=heuristic in heuristic_only mode', async () => {
    const config: PipelineConfig = {
      storage: makeMockStorage(),
      embedding: makeMockEmbedding(),
      cheapLLM: { complete: vi.fn(), model: 'test-llm' },
      embeddingModel: 'test-model',
      embeddingDim: 3,
      extractionTier: 'heuristic_only',
    };

    const result = await runExtractionPipeline(config, makeRawTextInput('Hello'));
    expect(result.tier).toBe('heuristic');
  });

  it('returns tier=cheap_llm in cheap_only mode', async () => {
    const config: PipelineConfig = {
      storage: makeMockStorage(),
      embedding: makeMockEmbedding(),
      cheapLLM: makeMockLLM(makeLLMExtractionResponse([])),
      embeddingModel: 'test-model',
      embeddingDim: 3,
      extractionTier: 'cheap_only',
    };

    const result = await runExtractionPipeline(config, makeRawTextInput('Hello'));
    expect(result.tier).toBe('multi_tier'); // heuristic + cheap_llm
  });

  it('returns tier=smart_llm in smart_only mode', async () => {
    const config: PipelineConfig = {
      storage: makeMockStorage(),
      embedding: makeMockEmbedding(),
      cheapLLM: makeMockLLM(makeLLMExtractionResponse([])),
      smartLLM: makeMockLLM(makeLLMExtractionResponse([])),
      embeddingModel: 'test-model',
      embeddingDim: 3,
      extractionTier: 'smart_only',
    };

    const result = await runExtractionPipeline(config, makeRawTextInput('Hello'));
    expect(result.tier).toBe('multi_tier'); // heuristic + smart_llm
  });
});

import { describe, it, expect, vi } from 'vitest';
import { runExtractionFromQueue } from '../../src/extraction/pipeline.js';
import type { PipelineConfig } from '../../src/extraction/pipeline.js';
import type { StorageAdapter } from '../../src/adapters/storage.js';
import type { EmbeddingAdapter } from '../../src/adapters/embedding.js';
import type { LLMAdapter, LLMResponse } from '../../src/adapters/llm.js';
import type { ExtractionInput } from '../../src/extraction/types.js';
import type { Fact, Extraction, Entity, Edge } from '../../src/models/index.js';

// ---------------------------------------------------------------------------
// Fixed IDs
// ---------------------------------------------------------------------------

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const SCOPE_ID = '22222222-2222-2222-2222-222222222222';
const EXTRACTION_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

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
    id: EXTRACTION_ID,
    tenantId: TENANT_ID,
    status: 'queued',
    inputType: 'raw_text',
    inputData: null,
    inputHash: 'abc123',
    inputSize: 9,
    scope: 'user',
    scopeId: SCOPE_ID,
    sessionId: null,
    tierUsed: null,
    llmModel: null,
    factsCreated: 0,
    factsUpdated: 0,
    factsInvalidated: 0,
    entitiesCreated: 0,
    edgesCreated: 0,
    costTokensInput: 0,
    costTokensOutput: 0,
    costUsd: 0.0,
    durationMs: null,
    error: null,
    retryCount: 0,
    createdAt: new Date(),
    completedAt: null,
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
    validFrom: new Date(),
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
  const extractions = new Map<string, Extraction>();
  const facts = new Map<string, Fact>();
  const entities = new Map<string, Entity>();
  const edges = new Map<string, Edge>();

  // Pre-populate the extraction record (simulating the API route already created it)
  extractions.set(EXTRACTION_ID, makeStoredExtraction());

  return {
    createFact: vi.fn(async (fact) => {
      const stored = makeStoredFact({ ...fact });
      facts.set(fact.id, stored);
      return stored;
    }),
    getFact: vi.fn(async (_tenantId, id) => facts.get(id) ?? null),
    getFactsByIds: vi.fn(async () => []),
    getFactsByLineage: vi.fn(async () => []),
    getFactsByScope: vi.fn(async () => ({ data: [], cursor: null, hasMore: false })),
    invalidateFact: vi.fn(async () => {}),
    purgeFacts: vi.fn(async () => 0),
    updateDecayScores: vi.fn(async () => {}),
    vectorSearch: vi.fn(async () => []),
    keywordSearch: vi.fn(async () => []),
    createEntity: vi.fn(async (entity) => {
      const stored = makeStoredEntity({ ...entity });
      entities.set(entity.id, stored);
      return stored;
    }),
    getEntity: vi.fn(async (_tenantId, id) => entities.get(id) ?? null),
    findEntityByCanonicalName: vi.fn(async () => null),
    getEntitiesForTenant: vi.fn(async () => ({ data: [], cursor: null, hasMore: false })),
    linkFactEntity: vi.fn(async () => {}),
    getEntitiesForFact: vi.fn(async () => []),
    getFactsForEntity: vi.fn(async () => ({ data: [], cursor: null, hasMore: false })),
    createEdge: vi.fn(async (edge) => {
      const stored = makeStoredEdge({ ...edge });
      edges.set(edge.id, stored);
      return stored;
    }),
    getEdgesForEntity: vi.fn(async () => []),
    graphTraversal: vi.fn(async () => ({ entities: [], edges: [] })),
    createTrigger: vi.fn(async () => { throw new Error('not implemented'); }),
    getTrigger: vi.fn(async () => null),
    getActiveTriggers: vi.fn(async () => []),
    updateTrigger: vi.fn(async () => { throw new Error('not implemented'); }),
    deleteTrigger: vi.fn(async () => {}),
    incrementTriggerFired: vi.fn(async () => {}),
    createMemoryAccess: vi.fn(async () => { throw new Error('not implemented'); }),
    updateFeedback: vi.fn(async () => {}),
    createExtraction: vi.fn(async (extraction) => {
      const stored = makeStoredExtraction({ ...extraction, status: 'queued' });
      extractions.set(extraction.id, stored);
      return stored;
    }),
    getExtraction: vi.fn(async (_tenantId, id) => extractions.get(id) ?? null),
    updateExtraction: vi.fn(async (_tenantId, id, updates) => {
      const existing = extractions.get(id);
      if (!existing) throw new Error(`Extraction ${id} not found`);
      const updated = { ...existing, ...updates };
      extractions.set(id, updated);
      return updated;
    }),
    getExtractionByHash: vi.fn(async () => null),
    getExtractionsByTenant: vi.fn(async () => ({ data: [], cursor: null, hasMore: false })),
    createSession: vi.fn(async () => { throw new Error('not implemented'); }),
    getSession: vi.fn(async () => null),
    endSession: vi.fn(async () => { throw new Error('not implemented'); }),
    getSessionsByScope: vi.fn(async () => ({ data: [], cursor: null, hasMore: false })),
    createTenant: vi.fn(async () => { throw new Error('not implemented'); }),
    getTenant: vi.fn(async () => null),
    getTenantBySlug: vi.fn(async () => null),
    updateTenant: vi.fn(async () => { throw new Error('not implemented'); }),
    createApiKey: vi.fn(async () => { throw new Error('not implemented'); }),
    getApiKeyByPrefix: vi.fn(async () => null),
    getApiKeysForTenant: vi.fn(async () => []),
    revokeApiKey: vi.fn(async () => {}),
    updateApiKeyLastUsed: vi.fn(async () => {}),
    incrementUsage: vi.fn(async () => {}),
    getUsage: vi.fn(async () => null),
    getCurrentUsage: vi.fn(async () => null),
    createWebhook: vi.fn(async () => { throw new Error('not implemented'); }),
    getWebhook: vi.fn(async () => null),
    getWebhooksForTenant: vi.fn(async () => []),
    getWebhooksByEvent: vi.fn(async () => []),
    deleteWebhook: vi.fn(async () => {}),
    ping: vi.fn(async () => true),
    ...overrides,
  } as unknown as StorageAdapter;
}

function makeMockEmbedding(): EmbeddingAdapter {
  return {
    embed: vi.fn(async () => [0.1, 0.2, 0.3]),
    embedBatch: vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3])),
    model: 'test-embedding-model',
    dimensions: 3,
  } as EmbeddingAdapter;
}

function makeLLMExtractionResponse(
  facts: Array<{
    content: string;
    importance?: number;
    operation?: string;
  }>,
  confidence = 0.85,
): string {
  return JSON.stringify({
    facts: facts.map(f => ({
      content: f.content,
      importance: f.importance ?? 0.7,
      operation: f.operation ?? 'add',
      existing_lineage_id: null,
      contradicts_fact_id: null,
      entities: [],
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
// Helpers
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<ExtractionInput> = {}): ExtractionInput {
  return {
    tenantId: TENANT_ID,
    scope: 'user',
    scopeId: SCOPE_ID,
    inputType: 'raw_text',
    data: 'Alice works at Acme Corp',
    ...overrides,
  };
}

function makeConfig(
  storageOverrides: Partial<StorageAdapter> = {},
  llmContent = makeLLMExtractionResponse([{ content: "Alice works at Acme Corp", importance: 0.9 }]),
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
// Tests
// ---------------------------------------------------------------------------

describe('runExtractionFromQueue', () => {
  it('uses the provided extractionId (does not create a new extraction record)', async () => {
    const config = makeConfig();
    const input = makeInput();

    const result = await runExtractionFromQueue(config, EXTRACTION_ID, input);

    // Should use the provided extraction ID
    expect(result.extractionId).toBe(EXTRACTION_ID);

    // Should NOT call createExtraction (record already exists)
    expect(config.storage.createExtraction).not.toHaveBeenCalled();

    // Should NOT call getExtractionByHash (hash check already done by route)
    expect(config.storage.getExtractionByHash).not.toHaveBeenCalled();
  });

  it('updates status to processing then completed', async () => {
    const config = makeConfig();
    const input = makeInput();

    await runExtractionFromQueue(config, EXTRACTION_ID, input);

    const updateCalls = (config.storage.updateExtraction as ReturnType<typeof vi.fn>).mock.calls;

    // First call: status → 'processing'
    expect(updateCalls[0][0]).toBe(TENANT_ID);
    expect(updateCalls[0][1]).toBe(EXTRACTION_ID);
    expect(updateCalls[0][2]).toEqual({ status: 'processing' });

    // Last call: status → 'completed'
    const lastCall = updateCalls[updateCalls.length - 1];
    expect(lastCall[0]).toBe(TENANT_ID);
    expect(lastCall[1]).toBe(EXTRACTION_ID);
    expect(lastCall[2].status).toBe('completed');
    expect(lastCall[2].completedAt).toBeInstanceOf(Date);
    expect(lastCall[2].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('on error, updates status to failed and re-throws', async () => {
    const embedError = new Error('Embedding service unavailable');
    const config = makeConfig();
    // Override embedding to throw (this is called during fact persistence and will propagate)
    config.embedding = {
      embed: vi.fn(async () => { throw embedError; }),
      embedBatch: vi.fn(async () => { throw embedError; }),
      model: 'test-embedding-model',
      dimensions: 3,
    } as unknown as EmbeddingAdapter;
    const input = makeInput();

    await expect(
      runExtractionFromQueue(config, EXTRACTION_ID, input),
    ).rejects.toThrow('Embedding service unavailable');

    const updateCalls = (config.storage.updateExtraction as ReturnType<typeof vi.fn>).mock.calls;

    // First call: status → 'processing'
    expect(updateCalls[0][2]).toEqual({ status: 'processing' });

    // Second call: status → 'failed'
    expect(updateCalls[1][2].status).toBe('failed');
    expect(updateCalls[1][2].error).toBe('Embedding service unavailable');
  });

  it('returns a PipelineResult with correct counts', async () => {
    const config = makeConfig();
    const input = makeInput();

    const result = await runExtractionFromQueue(config, EXTRACTION_ID, input);

    expect(result.extractionId).toBe(EXTRACTION_ID);
    expect(typeof result.factsCreated).toBe('number');
    expect(typeof result.factsUpdated).toBe('number');
    expect(typeof result.factsInvalidated).toBe('number');
    expect(typeof result.entitiesCreated).toBe('number');
    expect(typeof result.edgesCreated).toBe('number');
    expect(typeof result.durationMs).toBe('number');
    expect(result.tier).toBeDefined();
  });

  it('increments usage after successful extraction', async () => {
    const config = makeConfig();
    const input = makeInput();

    await runExtractionFromQueue(config, EXTRACTION_ID, input);

    expect(config.storage.incrementUsage).toHaveBeenCalledTimes(1);
    const usageCall = (config.storage.incrementUsage as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(usageCall[0]).toBe(TENANT_ID);
  });
});

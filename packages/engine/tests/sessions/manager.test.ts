import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startSession, endSession } from '../../src/sessions/manager.js';
import type { StorageAdapter } from '../../src/adapters/storage.js';
import type { LLMAdapter, LLMResponse } from '../../src/adapters/llm.js';
import type { Session } from '../../src/models/session.js';
import type { Fact } from '../../src/models/fact.js';

// ---------------------------------------------------------------------------
// Fixed IDs for tests
// ---------------------------------------------------------------------------

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const SCOPE_ID = '22222222-2222-2222-2222-222222222222';
const SESSION_ID = '33333333-3333-3333-3333-333333333333';

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: SESSION_ID,
    tenantId: TENANT_ID,
    scope: 'user',
    scopeId: SCOPE_ID,
    startedAt: new Date('2025-01-01T00:00:00Z'),
    endedAt: null,
    summary: null,
    topics: [],
    messageCount: 0,
    factCount: 0,
    metadata: {},
    createdAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeFact(overrides: Partial<Fact> = {}): Fact {
  return {
    id: crypto.randomUUID(),
    tenantId: TENANT_ID,
    scope: 'user',
    scopeId: SCOPE_ID,
    sessionId: SESSION_ID,
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
    originalContent: null,
    extractionId: null,
    extractionTier: null,
    modality: 'text',
    tags: [],
    metadata: {},
    createdAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock adapters
// ---------------------------------------------------------------------------

function makeMockStorage(overrides: Partial<StorageAdapter> = {}): StorageAdapter {
  return {
    // Facts
    createFact: vi.fn(async () => { throw new Error('not implemented'); }),
    getFact: vi.fn(async () => null),
    getFactsByIds: vi.fn(async () => []),
    getFactsByLineage: vi.fn(async () => []),
    getFactsByScope: vi.fn(async () => ({ data: [], cursor: null, hasMore: false })),
    invalidateFact: vi.fn(async () => {}),
    purgeFacts: vi.fn(async () => 0),
    updateDecayScores: vi.fn(async () => {}),

    // Vector / keyword search
    vectorSearch: vi.fn(async () => []),
    keywordSearch: vi.fn(async () => []),

    // Entities
    createEntity: vi.fn(async () => { throw new Error('not implemented'); }),
    getEntity: vi.fn(async () => null),
    findEntityByCanonicalName: vi.fn(async () => null),
    getEntitiesForTenant: vi.fn(async () => ({ data: [], cursor: null, hasMore: false })),

    // Fact-Entity junction
    linkFactEntity: vi.fn(async () => {}),
    getEntitiesForFact: vi.fn(async () => []),
    getFactsForEntity: vi.fn(async () => ({ data: [], cursor: null, hasMore: false })),

    // Edges
    createEdge: vi.fn(async () => { throw new Error('not implemented'); }),
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
    createExtraction: vi.fn(async () => { throw new Error('not implemented'); }),
    getExtraction: vi.fn(async () => null),
    updateExtraction: vi.fn(async () => { throw new Error('not implemented'); }),
    getExtractionByHash: vi.fn(async () => null),

    // Sessions
    createSession: vi.fn(async (input) => makeSession({ ...input })),
    getSession: vi.fn(async () => null),
    endSession: vi.fn(async (_tenantId, id, summary, topics) =>
      makeSession({ id, endedAt: new Date(), summary: summary ?? null, topics: topics ?? [] }),
    ),
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

function makeMockLLM(overrides: Partial<LLMAdapter> = {}): LLMAdapter {
  return {
    complete: vi.fn(async (): Promise<LLMResponse> => ({
      content: JSON.stringify({
        summary: 'User discussed their preferences.',
        topics: ['preferences', 'cats'],
      }),
      tokensInput: 100,
      tokensOutput: 50,
      model: 'test-model',
    })),
    model: 'test-model',
    ...overrides,
  } as LLMAdapter;
}

// ---------------------------------------------------------------------------
// Tests: startSession
// ---------------------------------------------------------------------------

describe('startSession', () => {
  it('creates a session with correct params', async () => {
    const storage = makeMockStorage();
    const result = await startSession(storage, TENANT_ID, 'user', SCOPE_ID);

    expect(storage.createSession).toHaveBeenCalledOnce();
    const callArg = vi.mocked(storage.createSession).mock.calls[0]![0];
    expect(callArg.tenantId).toBe(TENANT_ID);
    expect(callArg.scope).toBe('user');
    expect(callArg.scopeId).toBe(SCOPE_ID);
    expect(result.tenantId).toBe(TENANT_ID);
    expect(result.scope).toBe('user');
    expect(result.scopeId).toBe(SCOPE_ID);
  });

  it('generates a UUID for id', async () => {
    const storage = makeMockStorage();
    await startSession(storage, TENANT_ID, 'user', SCOPE_ID);

    const callArg = vi.mocked(storage.createSession).mock.calls[0]![0];
    // UUID v4 format: 8-4-4-4-12 hex chars
    expect(callArg.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('passes metadata through', async () => {
    const storage = makeMockStorage();
    const metadata = { source: 'chat', lang: 'en' };
    await startSession(storage, TENANT_ID, 'agent', SCOPE_ID, metadata);

    const callArg = vi.mocked(storage.createSession).mock.calls[0]![0];
    expect(callArg.metadata).toEqual(metadata);
  });

  it('defaults metadata to empty object when not provided', async () => {
    const storage = makeMockStorage();
    await startSession(storage, TENANT_ID, 'user', SCOPE_ID);

    const callArg = vi.mocked(storage.createSession).mock.calls[0]![0];
    expect(callArg.metadata).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Tests: endSession
// ---------------------------------------------------------------------------

describe('endSession', () => {
  it('fetches session, generates summary, calls storage.endSession', async () => {
    const sessionFact = makeFact({ content: 'User likes cats' });
    const storage = makeMockStorage({
      getSession: vi.fn(async () => makeSession()),
      getFactsByScope: vi.fn(async () => ({
        data: [sessionFact],
        cursor: null,
        hasMore: false,
      })),
    });
    const llm = makeMockLLM();

    const result = await endSession(storage, llm, TENANT_ID, SESSION_ID);

    expect(storage.getSession).toHaveBeenCalledWith(TENANT_ID, SESSION_ID);
    expect(storage.getFactsByScope).toHaveBeenCalledWith(
      TENANT_ID, 'user', SCOPE_ID, { limit: 100 },
    );
    expect(llm.complete).toHaveBeenCalledOnce();
    expect(storage.endSession).toHaveBeenCalledWith(
      TENANT_ID,
      SESSION_ID,
      'User discussed their preferences.',
      ['preferences', 'cats'],
    );
    expect(result.endedAt).not.toBeNull();
  });

  it('with no facts does not call LLM and passes no summary', async () => {
    const storage = makeMockStorage({
      getSession: vi.fn(async () => makeSession()),
      getFactsByScope: vi.fn(async () => ({
        data: [],
        cursor: null,
        hasMore: false,
      })),
    });
    const llm = makeMockLLM();

    await endSession(storage, llm, TENANT_ID, SESSION_ID);

    expect(llm.complete).not.toHaveBeenCalled();
    expect(storage.endSession).toHaveBeenCalledWith(
      TENANT_ID,
      SESSION_ID,
      undefined,
      undefined,
    );
  });

  it('filters only facts belonging to the session', async () => {
    const sessionFact = makeFact({ sessionId: SESSION_ID, content: 'session fact' });
    const otherFact = makeFact({ sessionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', content: 'other fact' });
    const storage = makeMockStorage({
      getSession: vi.fn(async () => makeSession()),
      getFactsByScope: vi.fn(async () => ({
        data: [sessionFact, otherFact],
        cursor: null,
        hasMore: false,
      })),
    });
    const llm = makeMockLLM();

    await endSession(storage, llm, TENANT_ID, SESSION_ID);

    // LLM should only receive the session fact content
    const llmCall = vi.mocked(llm.complete).mock.calls[0]!;
    const userMessage = llmCall[0].find(m => m.role === 'user');
    expect(userMessage?.content).toBe('session fact');
    expect(userMessage?.content).not.toContain('other fact');
  });

  it('with facts generates summary and topics via LLM', async () => {
    const fact1 = makeFact({ content: 'User likes cats' });
    const fact2 = makeFact({ content: 'User lives in NYC' });
    const storage = makeMockStorage({
      getSession: vi.fn(async () => makeSession()),
      getFactsByScope: vi.fn(async () => ({
        data: [fact1, fact2],
        cursor: null,
        hasMore: false,
      })),
    });
    const llm = makeMockLLM({
      complete: vi.fn(async (): Promise<LLMResponse> => ({
        content: JSON.stringify({
          summary: 'User shared personal info.',
          topics: ['pets', 'location'],
        }),
        tokensInput: 100,
        tokensOutput: 50,
        model: 'test-model',
      })),
    });

    await endSession(storage, llm, TENANT_ID, SESSION_ID);

    expect(storage.endSession).toHaveBeenCalledWith(
      TENANT_ID,
      SESSION_ID,
      'User shared personal info.',
      ['pets', 'location'],
    );
  });

  it('with already-ended session throws error', async () => {
    const storage = makeMockStorage({
      getSession: vi.fn(async () =>
        makeSession({ endedAt: new Date('2025-01-02T00:00:00Z') }),
      ),
    });
    const llm = makeMockLLM();

    await expect(endSession(storage, llm, TENANT_ID, SESSION_ID))
      .rejects.toThrow(`Session ${SESSION_ID} already ended`);
  });

  it('with non-existent session throws error', async () => {
    const storage = makeMockStorage({
      getSession: vi.fn(async () => null),
    });
    const llm = makeMockLLM();

    await expect(endSession(storage, llm, TENANT_ID, SESSION_ID))
      .rejects.toThrow(`Session ${SESSION_ID} not found`);
  });

  it('handles LLM JSON parse failure gracefully (raw content as summary)', async () => {
    const sessionFact = makeFact({ content: 'User likes cats' });
    const storage = makeMockStorage({
      getSession: vi.fn(async () => makeSession()),
      getFactsByScope: vi.fn(async () => ({
        data: [sessionFact],
        cursor: null,
        hasMore: false,
      })),
    });
    const llm = makeMockLLM({
      complete: vi.fn(async (): Promise<LLMResponse> => ({
        content: 'This is not valid JSON, just a raw summary.',
        tokensInput: 100,
        tokensOutput: 50,
        model: 'test-model',
      })),
    });

    await endSession(storage, llm, TENANT_ID, SESSION_ID);

    expect(storage.endSession).toHaveBeenCalledWith(
      TENANT_ID,
      SESSION_ID,
      'This is not valid JSON, just a raw summary.',
      undefined,
    );
  });

  it('handles LLM response with non-string summary gracefully', async () => {
    const sessionFact = makeFact({ content: 'User likes cats' });
    const storage = makeMockStorage({
      getSession: vi.fn(async () => makeSession()),
      getFactsByScope: vi.fn(async () => ({
        data: [sessionFact],
        cursor: null,
        hasMore: false,
      })),
    });
    const llm = makeMockLLM({
      complete: vi.fn(async (): Promise<LLMResponse> => ({
        content: JSON.stringify({ summary: 42, topics: 'not-an-array' }),
        tokensInput: 100,
        tokensOutput: 50,
        model: 'test-model',
      })),
    });

    await endSession(storage, llm, TENANT_ID, SESSION_ID);

    expect(storage.endSession).toHaveBeenCalledWith(
      TENANT_ID,
      SESSION_ID,
      undefined,
      undefined,
    );
  });

  it('filters non-string values from topics array', async () => {
    const sessionFact = makeFact({ content: 'User likes cats' });
    const storage = makeMockStorage({
      getSession: vi.fn(async () => makeSession()),
      getFactsByScope: vi.fn(async () => ({
        data: [sessionFact],
        cursor: null,
        hasMore: false,
      })),
    });
    const llm = makeMockLLM({
      complete: vi.fn(async (): Promise<LLMResponse> => ({
        content: JSON.stringify({
          summary: 'A session about pets.',
          topics: ['cats', 123, null, 'dogs'],
        }),
        tokensInput: 100,
        tokensOutput: 50,
        model: 'test-model',
      })),
    });

    await endSession(storage, llm, TENANT_ID, SESSION_ID);

    expect(storage.endSession).toHaveBeenCalledWith(
      TENANT_ID,
      SESSION_ID,
      'A session about pets.',
      ['cats', 'dogs'],
    );
  });
});

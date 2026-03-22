import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getScratchpad,
  updateScratchpad,
  getRelevantScratchpad,
} from '../../src/scratchpad/scratchpad.js';
import type { StorageAdapter, PaginatedResult } from '../../src/adapters/storage.js';
import type { LLMAdapter, LLMResponse } from '../../src/adapters/llm.js';
import type { Fact } from '../../src/models/index.js';

// ---------------------------------------------------------------------------
// Fixed IDs
// ---------------------------------------------------------------------------

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const SCOPE = 'user';
const SCOPE_ID = '22222222-2222-2222-2222-222222222222';

// ---------------------------------------------------------------------------
// Helpers
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

function makeMockStorage(facts: Fact[] = []): StorageAdapter {
  return {
    getFactsByScope: vi.fn().mockResolvedValue({
      data: facts,
      cursor: null,
      hasMore: false,
    } as PaginatedResult<Fact>),
    invalidateFact: vi.fn().mockResolvedValue(undefined),
    createFact: vi.fn().mockImplementation(async (input) => ({
      ...makeStoredFact(),
      ...input,
      version: 1,
      validFrom: new Date(),
      validUntil: null,
      parentId: null,
      frequency: 0,
      lastAccessed: null,
      decayScore: 1.0,
      sourceRef: null,
      originalContent: null,
      extractionId: null,
      extractionTier: null,
      createdAt: new Date(),
    })),
  } as unknown as StorageAdapter;
}

function makeMockLLM(response = 'Compressed summary'): LLMAdapter {
  return {
    model: 'test-model',
    complete: vi.fn().mockResolvedValue({
      content: response,
      tokensInput: 100,
      tokensOutput: 50,
      model: 'test-model',
    } as LLMResponse),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Scratchpad', () => {
  describe('getScratchpad', () => {
    it('returns empty string when no scratchpad exists', async () => {
      const storage = makeMockStorage([]);
      const result = await getScratchpad(storage, TENANT_ID, SCOPE, SCOPE_ID);
      expect(result).toBe('');
    });

    it('returns scratchpad content when it exists', async () => {
      const scratchpadFact = makeStoredFact({
        content: 'User profile: likes cats, works as engineer',
        tags: ['scratchpad'],
      });
      const storage = makeMockStorage([scratchpadFact]);
      const result = await getScratchpad(storage, TENANT_ID, SCOPE, SCOPE_ID);
      expect(result).toBe('User profile: likes cats, works as engineer');
    });

    it('ignores facts without scratchpad tag', async () => {
      const normalFact = makeStoredFact({ content: 'some fact', tags: ['other'] });
      const storage = makeMockStorage([normalFact]);
      const result = await getScratchpad(storage, TENANT_ID, SCOPE, SCOPE_ID);
      expect(result).toBe('');
    });
  });

  describe('updateScratchpad', () => {
    it('does nothing when newFacts is empty', async () => {
      const storage = makeMockStorage([]);
      const llm = makeMockLLM();
      await updateScratchpad(storage, llm, TENANT_ID, SCOPE, SCOPE_ID, []);
      expect(storage.createFact).not.toHaveBeenCalled();
    });

    it('creates a new scratchpad fact with correct tags', async () => {
      const storage = makeMockStorage([]);
      const llm = makeMockLLM();

      await updateScratchpad(storage, llm, TENANT_ID, SCOPE, SCOPE_ID, [
        'User likes hiking',
        'User lives in NYC',
      ]);

      expect(storage.createFact).toHaveBeenCalledTimes(1);
      const createCall = (storage.createFact as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.tags).toEqual(['scratchpad']);
      expect(createCall.content).toBe('User likes hiking\nUser lives in NYC');
      expect(createCall.operation).toBe('create');
      expect(createCall.importance).toBe(1.0);
      expect(createCall.confidence).toBe(1.0);
      expect(createCall.sourceType).toBe('api');
      expect(createCall.embeddingModel).toBe('none');
    });

    it('appends to existing scratchpad and invalidates old', async () => {
      const existingScratchpad = makeStoredFact({
        id: 'aaaa1111-1111-1111-1111-111111111111',
        lineageId: 'bbbb2222-2222-2222-2222-222222222222',
        content: 'User likes cats',
        tags: ['scratchpad'],
      });
      const storage = makeMockStorage([existingScratchpad]);
      const llm = makeMockLLM();

      await updateScratchpad(storage, llm, TENANT_ID, SCOPE, SCOPE_ID, [
        'User also likes dogs',
      ]);

      // Should invalidate old scratchpad
      expect(storage.invalidateFact).toHaveBeenCalledWith(TENANT_ID, 'aaaa1111-1111-1111-1111-111111111111');

      // Should create new scratchpad with appended content
      expect(storage.createFact).toHaveBeenCalledTimes(1);
      const createCall = (storage.createFact as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.content).toContain('User likes cats');
      expect(createCall.content).toContain('--- New information ---');
      expect(createCall.content).toContain('User also likes dogs');
      expect(createCall.operation).toBe('update');
      // Should reuse lineage ID
      expect(createCall.lineageId).toBe('bbbb2222-2222-2222-2222-222222222222');
    });

    it('triggers compression when content exceeds threshold', async () => {
      // Create a long existing scratchpad
      const longContent = 'A'.repeat(4500);
      const existingScratchpad = makeStoredFact({
        content: longContent,
        tags: ['scratchpad'],
      });
      const storage = makeMockStorage([existingScratchpad]);
      const llm = makeMockLLM('Compressed version of the profile');

      // New facts that push it over 5000 chars
      const newFacts = ['B'.repeat(600)];
      await updateScratchpad(storage, llm, TENANT_ID, SCOPE, SCOPE_ID, newFacts);

      // LLM should have been called for compression
      expect(llm.complete).toHaveBeenCalledTimes(1);
      const llmCall = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(llmCall[0][0].role).toBe('system');
      expect(llmCall[0][0].content).toContain('Compress');

      // The stored content should be the compressed version
      const createCall = (storage.createFact as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.content).toBe('Compressed version of the profile');
    });

    it('does not compress when content is under threshold', async () => {
      const storage = makeMockStorage([]);
      const llm = makeMockLLM();

      await updateScratchpad(storage, llm, TENANT_ID, SCOPE, SCOPE_ID, [
        'Short fact',
      ]);

      expect(llm.complete).not.toHaveBeenCalled();
    });
  });

  describe('getRelevantScratchpad', () => {
    it('returns empty string when no scratchpad exists', async () => {
      const storage = makeMockStorage([]);
      const llm = makeMockLLM();
      const result = await getRelevantScratchpad(storage, llm, TENANT_ID, SCOPE, SCOPE_ID, 'query');
      expect(result).toBe('');
    });

    it('returns empty string when scratchpad is too short', async () => {
      const shortScratchpad = makeStoredFact({
        content: 'Hi',
        tags: ['scratchpad'],
      });
      const storage = makeMockStorage([shortScratchpad]);
      const llm = makeMockLLM();
      const result = await getRelevantScratchpad(storage, llm, TENANT_ID, SCOPE, SCOPE_ID, 'query');
      expect(result).toBe('');
    });

    it('returns full content when scratchpad is short (under 1000 chars)', async () => {
      const content = 'User likes cats. Works as an engineer in NYC. Has a dog named Rex.';
      const scratchpad = makeStoredFact({
        content,
        tags: ['scratchpad'],
      });
      const storage = makeMockStorage([scratchpad]);
      const llm = makeMockLLM();
      const result = await getRelevantScratchpad(storage, llm, TENANT_ID, SCOPE, SCOPE_ID, 'pets');
      expect(result).toBe(content);
      // LLM should NOT have been called since content is short
      expect(llm.complete).not.toHaveBeenCalled();
    });

    it('filters content via LLM when scratchpad is long', async () => {
      const longContent = 'A'.repeat(1200);
      const scratchpad = makeStoredFact({
        content: longContent,
        tags: ['scratchpad'],
      });
      const storage = makeMockStorage([scratchpad]);
      const llm = makeMockLLM('Relevant excerpt about pets');
      const result = await getRelevantScratchpad(storage, llm, TENANT_ID, SCOPE, SCOPE_ID, 'pets');
      expect(result).toBe('Relevant excerpt about pets');
      expect(llm.complete).toHaveBeenCalledTimes(1);
    });
  });
});

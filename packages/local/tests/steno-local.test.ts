import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createStenoLocal, type StenoLocal } from '../src/steno-local.js';
import type { StenoLocalConfig } from '../src/config.js';

// Mock the OpenAI compat adapters to avoid real network calls
vi.mock('@steno-ai/openai-compat-adapter', () => {
  return {
    OpenAICompatLLMAdapter: class {
      model: string;
      constructor(config: { model: string }) {
        this.model = config.model;
      }
      async complete() {
        return {
          content: JSON.stringify({
            facts: [
              {
                content: 'User prefers dark mode',
                importance: 0.7,
                confidence: 0.9,
                sourceType: 'conversation',
                modality: 'text',
                tags: ['preference'],
                originalContent: 'I prefer dark mode',
                operation: 'add',
                entityCanonicalNames: [],
              },
            ],
            entities: [],
            edges: [],
          }),
          tokensInput: 10,
          tokensOutput: 20,
          model: config.model,
        };
      }
    },
    OpenAICompatEmbeddingAdapter: class {
      model: string;
      dimensions: number;
      constructor(config: { model: string; dimensions?: number }) {
        this.model = config.model;
        this.dimensions = config.dimensions ?? 768;
      }
      async embed(_text: string) {
        // Return a deterministic embedding vector
        return Array.from({ length: this.dimensions }, (_, i) => Math.sin(i * 0.1));
      }
      async embedBatch(texts: string[]) {
        return texts.map(() =>
          Array.from({ length: this.dimensions }, (_, i) => Math.sin(i * 0.1))
        );
      }
    },
    checkProvider: async () => ({ available: true, models: ['test-model'] }),
  };
});

const TEST_CONFIG: StenoLocalConfig = {
  dbPath: ':memory:',
  llm: { baseUrl: 'http://localhost:11434/v1', model: 'test-model' },
  embedding: { baseUrl: 'http://localhost:11434/v1', model: 'test-embed', dimensions: 64 },
  extractionTier: 'heuristic_only', // Use heuristic only to avoid LLM extraction parsing issues
};

describe('createStenoLocal', () => {
  let steno: StenoLocal;

  beforeEach(() => {
    steno = createStenoLocal(TEST_CONFIG);
  });

  afterEach(() => {
    steno.close();
  });

  it('returns StenoLocal with all namespaces', () => {
    expect(steno.memory).toBeDefined();
    expect(steno.memory.add).toBeTypeOf('function');
    expect(steno.memory.addAsync).toBeTypeOf('function');
    expect(steno.memory.search).toBeTypeOf('function');
    expect(steno.memory.get).toBeTypeOf('function');
    expect(steno.memory.list).toBeTypeOf('function');
    expect(steno.memory.history).toBeTypeOf('function');
    expect(steno.memory.delete).toBeTypeOf('function');
    expect(steno.memory.purge).toBeTypeOf('function');
    expect(steno.memory.getExtraction).toBeTypeOf('function');

    expect(steno.sessions).toBeDefined();
    expect(steno.sessions.start).toBeTypeOf('function');
    expect(steno.sessions.end).toBeTypeOf('function');
    expect(steno.sessions.list).toBeTypeOf('function');

    expect(steno.triggers).toBeDefined();
    expect(steno.triggers.create).toBeTypeOf('function');
    expect(steno.triggers.list).toBeTypeOf('function');
    expect(steno.triggers.update).toBeTypeOf('function');
    expect(steno.triggers.delete).toBeTypeOf('function');

    expect(steno.feedback).toBeDefined();
    expect(steno.feedback.submit).toBeTypeOf('function');

    expect(steno.graph).toBeDefined();
    expect(steno.graph.getEntity).toBeTypeOf('function');
    expect(steno.graph.findEntity).toBeTypeOf('function');
    expect(steno.graph.getRelated).toBeTypeOf('function');
    expect(steno.graph.listEntities).toBeTypeOf('function');

    expect(steno.export).toBeTypeOf('function');
    expect(steno.import).toBeTypeOf('function');
    expect(steno.close).toBeTypeOf('function');
  });

  it('auto-creates the default tenant', async () => {
    // Trigger tenant creation by calling any method
    const result = await steno.memory.list({ scope: 'user', scopeId: 'test-user' });
    expect(result).toBeDefined();
    expect(result.data).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it('memory.add runs extraction pipeline (heuristic)', async () => {
    const result = await steno.memory.add({
      scope: 'user',
      scopeId: 'user-1',
      data: 'My name is Alice and I live in Portland. I prefer dark mode.',
    });

    expect(result).toBeDefined();
    expect(result.extractionId).toBeTypeOf('string');
    expect(typeof result.factsCreated).toBe('number');
    expect(result.factsCreated).toBeGreaterThanOrEqual(0);
  });

  it('memory.search returns results', async () => {
    // Add some data first
    await steno.memory.add({
      scope: 'user',
      scopeId: 'user-1',
      data: 'The user likes TypeScript and uses VSCode.',
    });

    const searchResult = await steno.memory.search({
      query: 'TypeScript',
      scope: 'user',
      scopeId: 'user-1',
    });

    expect(searchResult).toBeDefined();
    expect(searchResult.results).toBeDefined();
    expect(Array.isArray(searchResult.results)).toBe(true);
  });

  it('memory.list returns paginated results', async () => {
    await steno.memory.add({
      scope: 'user',
      scopeId: 'user-2',
      data: 'User prefers dark mode. User lives in Portland.',
    });

    const result = await steno.memory.list({ scope: 'user', scopeId: 'user-2' });
    expect(result).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
    expect(typeof result.hasMore).toBe('boolean');
  });

  it('memory.get returns a specific fact', async () => {
    await steno.memory.add({
      scope: 'user',
      scopeId: 'user-3',
      data: 'The user likes hiking in the mountains.',
    });

    const listed = await steno.memory.list({ scope: 'user', scopeId: 'user-3' });
    if (listed.data.length > 0) {
      const fact = await steno.memory.get(listed.data[0]!.id);
      expect(fact).toBeDefined();
      expect(fact!.id).toBe(listed.data[0]!.id);
    }
  });

  it('memory.get returns null for nonexistent id', async () => {
    const fact = await steno.memory.get('00000000-0000-0000-0000-000000000099');
    expect(fact).toBeNull();
  });

  it('memory.delete invalidates a fact', async () => {
    await steno.memory.add({
      scope: 'user',
      scopeId: 'user-del',
      data: 'The user likes pizza.',
    });

    const listed = await steno.memory.list({ scope: 'user', scopeId: 'user-del' });
    if (listed.data.length > 0) {
      const factId = listed.data[0]!.id;
      await steno.memory.delete(factId);
      const deleted = await steno.memory.get(factId);
      // After invalidation, validUntil should be set
      expect(deleted).toBeDefined();
      expect(deleted!.validUntil).not.toBeNull();
    }
  });

  it('memory.purge removes facts for a scope', async () => {
    await steno.memory.add({
      scope: 'user',
      scopeId: 'user-purge',
      data: 'Something to purge.',
    });

    const count = await steno.memory.purge('user', 'user-purge');
    expect(typeof count).toBe('number');

    const listed = await steno.memory.list({ scope: 'user', scopeId: 'user-purge' });
    // After purge, either all facts are invalidated or removed
    const validFacts = listed.data.filter((f: any) => f.validUntil === null);
    expect(validFacts.length).toBe(0);
  });

  it('sessions.start creates a session', async () => {
    const session = await steno.sessions.start({
      scope: 'user',
      scopeId: 'user-sess',
      metadata: { source: 'test' },
    });

    expect(session).toBeDefined();
    expect(session.id).toBeTypeOf('string');
    expect(session.scope).toBe('user');
    expect(session.scopeId).toBe('user-sess');
  });

  it('sessions.list returns sessions', async () => {
    await steno.sessions.start({ scope: 'user', scopeId: 'user-sess-list' });
    await steno.sessions.start({ scope: 'user', scopeId: 'user-sess-list' });

    const result = await steno.sessions.list({ scope: 'user', scopeId: 'user-sess-list' });
    expect(result.data.length).toBe(2);
  });

  it('triggers.create + list', async () => {
    const trigger = await steno.triggers.create({
      scope: 'user',
      scopeId: 'user-trig',
      condition: { keyword_any: ['test'] },
    });

    expect(trigger).toBeDefined();
    expect(trigger.id).toBeTypeOf('string');

    const triggers = await steno.triggers.list('user', 'user-trig');
    expect(triggers.length).toBeGreaterThanOrEqual(1);
  });

  it('graph.listEntities works', async () => {
    const result = await steno.graph.listEntities();
    expect(result).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('export returns data structure', async () => {
    const exported = await steno.export('user', 'export-test');
    expect(exported).toBeDefined();
    expect(Array.isArray(exported.facts)).toBe(true);
    expect(Array.isArray(exported.entities)).toBe(true);
    expect(Array.isArray(exported.sessions)).toBe(true);
  });

  it('close works without error', () => {
    const s = createStenoLocal(TEST_CONFIG);
    expect(() => s.close()).not.toThrow();
  });

  it('memory.history returns lineage', async () => {
    await steno.memory.add({
      scope: 'user',
      scopeId: 'user-hist',
      data: 'User favorite color is blue.',
    });

    const listed = await steno.memory.list({ scope: 'user', scopeId: 'user-hist' });
    if (listed.data.length > 0) {
      const history = await steno.memory.history(listed.data[0]!.id);
      expect(Array.isArray(history)).toBe(true);
    }
  });

  it('memory.history returns empty for nonexistent fact', async () => {
    const history = await steno.memory.history('00000000-0000-0000-0000-000000000099');
    expect(history).toEqual([]);
  });

  it('memory.getExtraction works', async () => {
    const addResult = await steno.memory.add({
      scope: 'user',
      scopeId: 'user-ext',
      data: 'Some extraction test data.',
    });

    const extraction = await steno.memory.getExtraction(addResult.extractionId);
    expect(extraction).toBeDefined();
    expect(extraction!.id).toBe(addResult.extractionId);
    expect(extraction!.status).toBe('completed');
  });
});

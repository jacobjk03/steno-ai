import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createStenoServer, type StenoServer } from '../src/server.js';
import type { StenoLocalConfig } from '../src/config.js';

// Mock the OpenAI compat adapters
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
            facts: [],
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
        this.dimensions = config.dimensions ?? 64;
      }
      async embed() {
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
  extractionTier: 'heuristic_only',
};

describe('createStenoServer', () => {
  let server: StenoServer;

  beforeEach(() => {
    server = createStenoServer({ ...TEST_CONFIG });
  });

  afterEach(() => {
    server.stop();
  });

  it('GET /health returns 200', async () => {
    const res = await server.app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.mode).toBe('local');
  });

  it('POST /v1/memory/search works', async () => {
    // First add some data
    const addRes = await server.app.request('/v1/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'user',
        scopeId: 'test-user',
        data: 'I like TypeScript.',
      }),
    });
    expect(addRes.status).toBe(200);

    // Now search
    const searchRes = await server.app.request('/v1/memory/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'TypeScript',
        scope: 'user',
        scopeId: 'test-user',
      }),
    });
    expect(searchRes.status).toBe(200);
    const searchBody = await searchRes.json();
    expect(searchBody.data).toBeDefined();
    expect(searchBody.data.results).toBeDefined();
  });

  it('GET /v1/memory returns list', async () => {
    const res = await server.app.request('/v1/memory?scope=user&scope_id=u1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('POST /v1/sessions creates a session', async () => {
    const res = await server.app.request('/v1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'user',
        scopeId: 'sess-test',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBeTypeOf('string');
  });

  it('GET /v1/memory/:id returns 404 for nonexistent', async () => {
    const res = await server.app.request('/v1/memory/00000000-0000-0000-0000-000000000099');
    expect(res.status).toBe(404);
  });

  it('exposes steno instance for programmatic access', () => {
    expect(server.steno).toBeDefined();
    expect(server.steno.memory).toBeDefined();
    expect(server.steno.sessions).toBeDefined();
  });
});

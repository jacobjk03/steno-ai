import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createStenoLocal, type StenoLocal } from '../src/steno-local.js';
import { syncToCloud, syncFromCloud } from '../src/sync.js';
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

describe('sync', () => {
  let steno: StenoLocal;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    steno = createStenoLocal(TEST_CONFIG);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    steno.close();
    vi.unstubAllGlobals();
  });

  describe('export and import', () => {
    it('export returns data with facts/entities/sessions arrays', async () => {
      const data = await steno.export('user', '*');
      expect(data).toBeDefined();
      expect(Array.isArray(data.facts)).toBe(true);
      expect(Array.isArray(data.entities)).toBe(true);
      expect(Array.isArray(data.sessions)).toBe(true);
    });

    it('export contains added facts', async () => {
      await steno.memory.add({
        scope: 'user',
        scopeId: 'export-user',
        data: 'I like TypeScript and use Neovim.',
      });

      const data = await steno.export('user', 'export-user');
      expect(data.facts.length).toBeGreaterThan(0);
    });

    it('import inserts data into local DB', async () => {
      // First add data to export
      await steno.memory.add({
        scope: 'user',
        scopeId: 'import-source',
        data: 'I prefer dark mode and use TypeScript.',
      });
      const exported = await steno.export('user', 'import-source');

      // Create a fresh instance and import
      const steno2 = createStenoLocal(TEST_CONFIG);
      try {
        const result = await steno2.import(exported);
        expect(result.factsImported).toBe(exported.facts.length);
        expect(result.entitiesImported).toBe(exported.entities.length);

        // Verify facts are actually in the DB
        const listed = await steno2.memory.list({ scope: 'user', scopeId: 'import-source' });
        expect(listed.data.length).toBe(exported.facts.length);
      } finally {
        steno2.close();
      }
    });

    it('import with empty data returns zero counts', async () => {
      const result = await steno.import({ facts: [], entities: [], sessions: [] });
      expect(result.factsImported).toBe(0);
      expect(result.entitiesImported).toBe(0);
    });

    it('import with missing arrays defaults to empty', async () => {
      const result = await steno.import({});
      expect(result.factsImported).toBe(0);
      expect(result.entitiesImported).toBe(0);
    });
  });

  describe('syncToCloud', () => {
    /** Helper: import known facts into local so sync has data to work with. */
    async function seedFacts(): Promise<void> {
      await steno.import({
        facts: [
          { id: 'fact-1', content: 'User likes pizza', scope: 'user', scopeId: 'sync-user', importance: 0.7, confidence: 0.9, sourceType: 'conversation', modality: 'text', tags: [], embedding: Array.from({ length: 64 }, (_, i) => Math.sin(i * 0.1)) },
          { id: 'fact-2', content: 'User uses TypeScript', scope: 'user', scopeId: 'sync-user', importance: 0.8, confidence: 0.95, sourceType: 'conversation', modality: 'text', tags: [], embedding: Array.from({ length: 64 }, (_, i) => Math.cos(i * 0.1)) },
        ],
        entities: [],
        sessions: [],
      });
    }

    it('dry-run reports count without making API calls', async () => {
      await seedFacts();

      const consoleSpy = vi.spyOn(console, 'log');
      const result = await syncToCloud(steno, {
        apiKey: 'sk_test_123',
        cloudUrl: 'https://api.steno.ai',
        dryRun: true,
      });

      expect(result.factsSynced).toBe(0);
      expect(result.entitiesSynced).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Dry run'));
      consoleSpy.mockRestore();
    });

    it('sends POST requests with correct auth header', async () => {
      await seedFacts();

      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'cloud-fact-1' }),
      });

      const result = await syncToCloud(steno, {
        apiKey: 'sk_test_mykey',
        cloudUrl: 'https://api.steno.ai',
      });

      expect(result.factsSynced).toBeGreaterThan(0);
      expect(fetchMock).toHaveBeenCalled();

      // Verify the fetch call had correct URL and auth
      const firstCall = fetchMock.mock.calls[0]!;
      expect(firstCall[0]).toBe('https://api.steno.ai/v1/memory');
      expect(firstCall[1].headers['Authorization']).toBe('Bearer sk_test_mykey');
      expect(firstCall[1].headers['Content-Type']).toBe('application/json');
      expect(firstCall[1].method).toBe('POST');
    });

    it('handles API errors gracefully', async () => {
      await seedFacts();

      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await syncToCloud(steno, {
        apiKey: 'sk_test_err',
        cloudUrl: 'https://api.steno.ai',
      });

      expect(result.factsSynced).toBe(0);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('handles network errors gracefully', async () => {
      await seedFacts();

      fetchMock.mockRejectedValue(new Error('Network error'));

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await syncToCloud(steno, {
        apiKey: 'sk_test_net',
        cloudUrl: 'https://api.steno.ai',
      });

      expect(result.factsSynced).toBe(0);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('with no facts returns zero counts', async () => {
      const result = await syncToCloud(steno, {
        apiKey: 'sk_test_empty',
        cloudUrl: 'https://api.steno.ai',
      });

      expect(result.factsSynced).toBe(0);
      expect(result.entitiesSynced).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('syncFromCloud', () => {
    it('fetches and imports data from cloud', async () => {
      // Create a source instance with data to simulate cloud export format
      const sourceSteno = createStenoLocal(TEST_CONFIG);
      try {
        await sourceSteno.memory.add({
          scope: 'user',
          scopeId: 'cloud-user',
          data: 'Fact from the cloud.',
        });
        const cloudData = await sourceSteno.export('user', 'cloud-user');

        fetchMock.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => cloudData,
        });

        const result = await syncFromCloud(steno, {
          apiKey: 'sk_test_from',
          cloudUrl: 'https://api.steno.ai',
        });

        expect(result.factsImported).toBe(cloudData.facts.length);
        expect(result.entitiesImported).toBe(cloudData.entities.length);

        // Verify fetch was called with correct URL and auth
        expect(fetchMock).toHaveBeenCalledWith(
          'https://api.steno.ai/v1/export?scope=user&scope_id=*&format=json',
          { headers: { 'Authorization': 'Bearer sk_test_from' } },
        );
      } finally {
        sourceSteno.close();
      }
    });

    it('throws on cloud API error', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
      });

      await expect(syncFromCloud(steno, {
        apiKey: 'sk_bad_key',
        cloudUrl: 'https://api.steno.ai',
      })).rejects.toThrow('Failed to fetch from cloud: HTTP 401');
    });

    it('handles data wrapped in data property', async () => {
      const cloudFacts = {
        data: {
          facts: [],
          entities: [],
          sessions: [],
        },
      };

      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => cloudFacts,
      });

      const result = await syncFromCloud(steno, {
        apiKey: 'sk_test_wrapped',
        cloudUrl: 'https://api.steno.ai',
      });

      expect(result.factsImported).toBe(0);
      expect(result.entitiesImported).toBe(0);
    });
  });
});

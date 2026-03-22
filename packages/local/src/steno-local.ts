import { SQLiteStorageAdapter } from '@steno-ai/sqlite-adapter';
import { OpenAICompatLLMAdapter, OpenAICompatEmbeddingAdapter } from '@steno-ai/openai-compat-adapter';
import { InMemoryCacheAdapter } from '@steno-ai/cache-adapter';
import {
  runExtractionPipeline,
  search,
  startSession,
  endSession,
  submitFeedback,
} from '@steno-ai/engine';
import type { PipelineConfig, SearchConfig } from '@steno-ai/engine';
import type { StenoLocalConfig } from './config.js';

export interface StenoLocal {
  memory: {
    add(input: { scope: string; scopeId: string; data: unknown; inputType?: string; sessionId?: string }): Promise<any>;
    addAsync(input: { scope: string; scopeId: string; data: unknown; inputType?: string; sessionId?: string }): Promise<{ extractionId: string }>;
    search(options: { query: string; scope: string; scopeId: string; limit?: number; includeGraph?: boolean }): Promise<any>;
    get(id: string): Promise<any>;
    list(options: { scope: string; scopeId: string; limit?: number; cursor?: string }): Promise<any>;
    history(id: string): Promise<any>;
    delete(id: string): Promise<void>;
    purge(scope: string, scopeId: string): Promise<number>;
    getExtraction(id: string): Promise<any>;
  };
  sessions: {
    start(options: { scope: string; scopeId: string; metadata?: Record<string, unknown> }): Promise<any>;
    end(id: string): Promise<any>;
    list(options: { scope: string; scopeId: string; limit?: number; cursor?: string }): Promise<any>;
  };
  triggers: {
    create(input: any): Promise<any>;
    list(scope: string, scopeId: string): Promise<any[]>;
    update(id: string, updates: any): Promise<any>;
    delete(id: string): Promise<void>;
  };
  feedback: {
    submit(input: { factId: string; wasUseful: boolean; feedbackType: string; feedbackDetail?: string }): Promise<void>;
  };
  graph: {
    getEntity(id: string): Promise<any>;
    findEntity(name: string, type: string): Promise<any>;
    getRelated(entityId: string, options?: { maxDepth?: number }): Promise<any>;
    listEntities(options?: { limit?: number; cursor?: string }): Promise<any>;
  };
  export(scope: string, scopeId: string): Promise<any>;
  import(data: any): Promise<{ factsImported: number; entitiesImported: number }>;
  close(): void;
}

/** Fixed local tenant ID — local mode is single-tenant. */
const LOCAL_TENANT_ID = '00000000-0000-0000-0000-000000000001';

async function initDefaultTenant(storage: SQLiteStorageAdapter, tenantId: string): Promise<void> {
  const existing = await storage.getTenant(tenantId);
  if (!existing) {
    await storage.createTenant({
      id: tenantId,
      name: 'Local',
      slug: 'local',
      plan: 'enterprise',
      config: {
        embeddingModel: 'local',
        embeddingDim: 768,
        decayHalfLifeDays: 30,
        decayNormalizationK: 50,
        maxFactsPerScope: 10000,
        retrievalWeights: { vector: 0.35, keyword: 0.15, graph: 0.2, recency: 0.15, salience: 0.15 },
      },
    });
  }
}

export function createStenoLocal(config: StenoLocalConfig): StenoLocal {
  // 1. Create SQLite adapter
  const storage = new SQLiteStorageAdapter(config.dbPath, {
    embeddingDim: config.embedding.dimensions ?? 768,
  });

  // 2. Create LLM adapters
  const cheapLLM = new OpenAICompatLLMAdapter(config.llm);
  const smartLLM = config.smartLLM ? new OpenAICompatLLMAdapter(config.smartLLM) : cheapLLM;

  // 3. Create embedding adapter
  const embedding = new OpenAICompatEmbeddingAdapter(config.embedding);

  // 4. Create cache (unused directly, but available for future use)
  const _cache = new InMemoryCacheAdapter();

  // 5. Initialize default tenant in DB
  const tenantId = LOCAL_TENANT_ID;
  let closed = false;
  const tenantReady = initDefaultTenant(storage, tenantId).catch(() => {
    // Swallow errors if DB was closed before tenant init completed
  });

  // Helper to ensure tenant is initialized before any operation
  async function ensureTenant(): Promise<void> {
    await tenantReady;
  }

  // 6. Build pipeline config
  const pipelineConfig: PipelineConfig = {
    storage,
    embedding,
    cheapLLM,
    smartLLM,
    extractionTier: config.extractionTier,
    embeddingModel: config.embedding.model,
    embeddingDim: config.embedding.dimensions ?? 768,
    decayHalfLifeDays: config.decayHalfLifeDays,
    decayNormalizationK: config.decayNormalizationK,
  };

  // 7. Build search config
  const searchConfig: SearchConfig = {
    storage,
    embedding,
    salienceHalfLifeDays: config.decayHalfLifeDays,
    salienceNormalizationK: config.decayNormalizationK,
  };

  // 8. Return StenoLocal interface
  return {
    memory: {
      async add(input) {
        await ensureTenant();
        return runExtractionPipeline(pipelineConfig, {
          tenantId,
          scope: input.scope as any,
          scopeId: input.scopeId,
          inputType: (input.inputType ?? 'conversation') as any,
          data: input.data,
          sessionId: input.sessionId,
        });
      },

      async addAsync(input) {
        await ensureTenant();
        const extractionId = crypto.randomUUID();
        const inputText = typeof input.data === 'string' ? input.data : JSON.stringify(input.data);
        await storage.createExtraction({
          id: extractionId,
          tenantId,
          inputType: (input.inputType ?? 'conversation') as any,
          inputData: inputText,
          inputHash: extractionId, // simplified hash for async
          scope: input.scope as any,
          scopeId: input.scopeId,
          sessionId: input.sessionId,
        });
        // Process in background
        setImmediate(() => {
          void runExtractionPipeline(pipelineConfig, {
            tenantId,
            scope: input.scope as any,
            scopeId: input.scopeId,
            inputType: (input.inputType ?? 'conversation') as any,
            data: input.data,
            sessionId: input.sessionId,
          }).catch(err => console.error('[steno-local] Async extraction failed:', err));
        });
        return { extractionId };
      },

      async search(options) {
        await ensureTenant();
        return search(searchConfig, {
          query: options.query,
          scope: options.scope,
          scopeId: options.scopeId,
          tenantId,
          limit: options.limit,
          includeGraph: options.includeGraph,
        });
      },

      async get(id) {
        await ensureTenant();
        return storage.getFact(tenantId, id);
      },

      async list(options) {
        await ensureTenant();
        return storage.getFactsByScope(tenantId, options.scope, options.scopeId, {
          limit: options.limit ?? 20,
          cursor: options.cursor,
        });
      },

      async history(id) {
        await ensureTenant();
        const fact = await storage.getFact(tenantId, id);
        if (!fact) return [];
        return storage.getFactsByLineage(tenantId, fact.lineageId);
      },

      async delete(id) {
        await ensureTenant();
        return storage.invalidateFact(tenantId, id);
      },

      async purge(scope, scopeId) {
        await ensureTenant();
        return storage.purgeFacts(tenantId, scope, scopeId);
      },

      async getExtraction(id) {
        await ensureTenant();
        return storage.getExtraction(tenantId, id);
      },
    },

    sessions: {
      async start(options) {
        await ensureTenant();
        return startSession(storage, tenantId, options.scope as any, options.scopeId, options.metadata);
      },

      async end(id) {
        await ensureTenant();
        return endSession(storage, cheapLLM, tenantId, id);
      },

      async list(options) {
        await ensureTenant();
        return storage.getSessionsByScope(tenantId, options.scope, options.scopeId, {
          limit: options.limit ?? 20,
          cursor: options.cursor,
        });
      },
    },

    triggers: {
      async create(input) {
        await ensureTenant();
        return storage.createTrigger({ ...input, tenantId, id: crypto.randomUUID() });
      },

      async list(scope, scopeId) {
        await ensureTenant();
        return storage.getActiveTriggers(tenantId, scope, scopeId);
      },

      async update(id, updates) {
        await ensureTenant();
        return storage.updateTrigger(tenantId, id, updates);
      },

      async delete(id) {
        await ensureTenant();
        return storage.deleteTrigger(tenantId, id);
      },
    },

    feedback: {
      async submit(input) {
        await ensureTenant();
        return submitFeedback(storage, tenantId, input.factId, {
          wasUseful: input.wasUseful,
          feedbackType: input.feedbackType as any,
          feedbackDetail: input.feedbackDetail,
        });
      },
    },

    graph: {
      async getEntity(id) {
        await ensureTenant();
        return storage.getEntity(tenantId, id);
      },

      async findEntity(name, type) {
        await ensureTenant();
        return storage.findEntityByCanonicalName(tenantId, name.toLowerCase(), type);
      },

      async getRelated(entityId, options) {
        await ensureTenant();
        return storage.graphTraversal({
          tenantId,
          entityIds: [entityId],
          maxDepth: options?.maxDepth ?? 3,
          maxEntities: 200,
        });
      },

      async listEntities(options) {
        await ensureTenant();
        return storage.getEntitiesForTenant(tenantId, {
          limit: options?.limit ?? 20,
          cursor: options?.cursor,
        });
      },
    },

    async export(scope, scopeId) {
      await ensureTenant();
      const facts = await storage.getFactsByScope(tenantId, scope, scopeId, { limit: 10000 });
      const entities = await storage.getEntitiesForTenant(tenantId, { limit: 10000 });
      const sessions = await storage.getSessionsByScope(tenantId, scope, scopeId, { limit: 10000 });
      return { facts: facts.data, entities: entities.data, sessions: sessions.data };
    },

    async import(data) {
      await ensureTenant();
      let factsImported = 0;
      let entitiesImported = 0;

      // Import entities first
      for (const entity of (data.entities ?? [])) {
        await storage.createEntity({
          ...entity,
          tenantId,
          id: entity.id ?? crypto.randomUUID(),
        });
        entitiesImported++;
      }

      // Import facts
      for (const fact of (data.facts ?? [])) {
        await storage.createFact({
          ...fact,
          tenantId,
          id: fact.id ?? crypto.randomUUID(),
          lineageId: fact.lineageId ?? crypto.randomUUID(),
          embeddingModel: config.embedding.model,
          embeddingDim: config.embedding.dimensions ?? 768,
        });
        factsImported++;
      }

      return { factsImported, entitiesImported };
    },

    close() {
      closed = true;
      storage.close();
    },
  };
}

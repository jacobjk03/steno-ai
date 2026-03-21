import type {
  Fact,
  CreateFact,
  Entity,
  CreateEntity,
  Edge,
  CreateEdge,
  Trigger,
  CreateTrigger,
  MemoryAccess,
  CreateMemoryAccess,
  Extraction,
  CreateExtraction,
  Session,
  CreateSession,
  Tenant,
  CreateTenant,
  ApiKey,
  CreateApiKey,
  UsageRecord,
} from '../models/index.js';

export interface PaginationOptions {
  limit: number;
  cursor?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  cursor: string | null;
  hasMore: boolean;
}

export interface VectorSearchOptions {
  embedding: number[];
  tenantId: string;
  scope: string;
  scopeId: string;
  limit: number;
  minSimilarity?: number;
  validOnly?: boolean;
  asOf?: Date;
}

export interface VectorSearchResult {
  fact: Fact;
  similarity: number;
}

export interface KeywordSearchOptions {
  query: string;
  tenantId: string;
  scope: string;
  scopeId: string;
  limit: number;
  validOnly?: boolean;
}

export interface GraphTraversalOptions {
  tenantId: string;
  entityIds: string[];
  maxDepth: number;
  maxEntities: number;
  validOnly?: boolean;
}

export interface GraphTraversalResult {
  entities: Entity[];
  edges: Edge[];
}

export interface StorageAdapter {
  // Facts
  createFact(fact: CreateFact & { id: string; lineageId: string; embeddingModel: string; embeddingDim: number; embedding?: number[] }): Promise<Fact>;
  getFact(tenantId: string, id: string): Promise<Fact | null>;
  getFactsByIds(tenantId: string, ids: string[]): Promise<Fact[]>;
  getFactsByLineage(tenantId: string, lineageId: string): Promise<Fact[]>;
  getFactsByScope(tenantId: string, scope: string, scopeId: string, options: PaginationOptions): Promise<PaginatedResult<Fact>>;
  invalidateFact(tenantId: string, id: string): Promise<void>;
  purgeFacts(tenantId: string, scope: string, scopeId: string): Promise<number>;
  updateDecayScores(tenantId: string, facts: Array<{ id: string; decayScore: number }>): Promise<void>;

  // Vector search
  vectorSearch(options: VectorSearchOptions): Promise<VectorSearchResult[]>;

  // Keyword search
  keywordSearch(options: KeywordSearchOptions): Promise<Fact[]>;

  // Entities
  createEntity(entity: CreateEntity & { id: string; embedding?: number[]; embeddingModel?: string; embeddingDim?: number }): Promise<Entity>;
  getEntity(tenantId: string, id: string): Promise<Entity | null>;
  findEntityByCanonicalName(tenantId: string, canonicalName: string, entityType: string): Promise<Entity | null>;
  getEntitiesForTenant(tenantId: string, options: PaginationOptions): Promise<PaginatedResult<Entity>>;

  // Fact-Entity junction
  linkFactEntity(factId: string, entityId: string, role: string): Promise<void>;
  getEntitiesForFact(factId: string): Promise<Entity[]>;
  getFactsForEntity(tenantId: string, entityId: string, options: PaginationOptions): Promise<PaginatedResult<Fact>>;

  // Edges
  createEdge(edge: CreateEdge & { id: string }): Promise<Edge>;
  getEdgesForEntity(tenantId: string, entityId: string): Promise<Edge[]>;
  graphTraversal(options: GraphTraversalOptions): Promise<GraphTraversalResult>;

  // Triggers
  createTrigger(trigger: CreateTrigger & { id: string }): Promise<Trigger>;
  getTrigger(tenantId: string, id: string): Promise<Trigger | null>;
  getActiveTriggers(tenantId: string, scope: string, scopeId: string): Promise<Trigger[]>;
  updateTrigger(tenantId: string, id: string, updates: Partial<Trigger>): Promise<Trigger>;
  deleteTrigger(tenantId: string, id: string): Promise<void>;
  incrementTriggerFired(tenantId: string, id: string): Promise<void>;

  // Memory Access (metamemory)
  createMemoryAccess(access: CreateMemoryAccess & { id: string }): Promise<MemoryAccess>;
  updateFeedback(tenantId: string, factId: string, feedback: { wasUseful: boolean; feedbackType: string; feedbackDetail?: string }): Promise<void>;

  // Extractions
  createExtraction(extraction: CreateExtraction & { id: string }): Promise<Extraction>;
  getExtraction(tenantId: string, id: string): Promise<Extraction | null>;
  updateExtraction(tenantId: string, id: string, updates: Partial<Extraction>): Promise<Extraction>;
  getExtractionByHash(tenantId: string, inputHash: string): Promise<Extraction | null>;

  // Sessions
  createSession(session: CreateSession & { id: string }): Promise<Session>;
  getSession(tenantId: string, id: string): Promise<Session | null>;
  endSession(tenantId: string, id: string, summary?: string, topics?: string[]): Promise<Session>;
  getSessionsByScope(tenantId: string, scope: string, scopeId: string, options: PaginationOptions): Promise<PaginatedResult<Session>>;

  // Tenants
  createTenant(tenant: CreateTenant & { id: string }): Promise<Tenant>;
  getTenant(id: string): Promise<Tenant | null>;
  getTenantBySlug(slug: string): Promise<Tenant | null>;
  updateTenant(id: string, updates: Partial<Tenant>): Promise<Tenant>;

  // API Keys
  createApiKey(apiKey: CreateApiKey & { id: string; keyHash: string; keyPrefix: string }): Promise<ApiKey>;
  getApiKeyByPrefix(prefix: string): Promise<ApiKey | null>;
  getApiKeysForTenant(tenantId: string): Promise<ApiKey[]>;
  revokeApiKey(tenantId: string, id: string): Promise<void>;
  updateApiKeyLastUsed(id: string): Promise<void>;

  // Usage
  incrementUsage(tenantId: string, tokens: number, queries: number, extractions: number, costUsd: number): Promise<void>;
  getUsage(tenantId: string, periodStart: Date): Promise<UsageRecord | null>;
  getCurrentUsage(tenantId: string): Promise<UsageRecord | null>;

  // Health
  ping(): Promise<boolean>;
}

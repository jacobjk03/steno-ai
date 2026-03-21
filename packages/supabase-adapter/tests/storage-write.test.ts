/**
 * Tests for SupabaseStorageAdapter write-path utilities.
 *
 * We do NOT need a real Supabase instance — these tests cover:
 *  1. camelCase → snake_case conversion (toSnakeCase)
 *  2. snake_case → camelCase conversion (toCamelCase)
 *  3. Table-name correctness verified via the mock Supabase client
 *  4. Input validation round-trips through Zod schemas
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toSnakeCase, toCamelCase } from '../src/storage.js';
import { SupabaseStorageAdapter } from '../src/storage.js';

// =============================================================================
// camelCase → snake_case
// =============================================================================

describe('toSnakeCase', () => {
  it('converts tenantId → tenant_id', () => {
    expect(toSnakeCase({ tenantId: 'abc' })).toEqual({ tenant_id: 'abc' });
  });

  it('converts validFrom → valid_from', () => {
    expect(toSnakeCase({ validFrom: new Date('2024-01-01') })).toEqual({
      valid_from: new Date('2024-01-01'),
    });
  });

  it('converts createdAt → created_at', () => {
    expect(toSnakeCase({ createdAt: '2024-01-01' })).toEqual({ created_at: '2024-01-01' });
  });

  it('converts costTokensInput → cost_tokens_input', () => {
    expect(toSnakeCase({ costTokensInput: 1000 })).toEqual({ cost_tokens_input: 1000 });
  });

  it('converts scopeId → scope_id', () => {
    expect(toSnakeCase({ scopeId: 'u-123' })).toEqual({ scope_id: 'u-123' });
  });

  it('converts embeddingModel → embedding_model', () => {
    expect(toSnakeCase({ embeddingModel: 'text-embedding-3-small' })).toEqual({
      embedding_model: 'text-embedding-3-small',
    });
  });

  it('converts lineageId → lineage_id', () => {
    expect(toSnakeCase({ lineageId: 'lid-001' })).toEqual({ lineage_id: 'lid-001' });
  });

  it('converts keyHash → key_hash', () => {
    expect(toSnakeCase({ keyHash: 'abc123' })).toEqual({ key_hash: 'abc123' });
  });

  it('converts keyPrefix → key_prefix', () => {
    expect(toSnakeCase({ keyPrefix: 'sk_' })).toEqual({ key_prefix: 'sk_' });
  });

  it('converts inputHash → input_hash', () => {
    expect(toSnakeCase({ inputHash: 'sha256xyz' })).toEqual({ input_hash: 'sha256xyz' });
  });

  it('converts inputType → input_type', () => {
    expect(toSnakeCase({ inputType: 'text' })).toEqual({ input_type: 'text' });
  });

  it('converts tierUsed → tier_used', () => {
    expect(toSnakeCase({ tierUsed: 'tier2' })).toEqual({ tier_used: 'tier2' });
  });

  it('converts factsCreated → facts_created', () => {
    expect(toSnakeCase({ factsCreated: 3 })).toEqual({ facts_created: 3 });
  });

  it('converts costTokensOutput → cost_tokens_output', () => {
    expect(toSnakeCase({ costTokensOutput: 500 })).toEqual({ cost_tokens_output: 500 });
  });

  it('preserves single-word keys unchanged', () => {
    expect(toSnakeCase({ id: '1', name: 'foo', slug: 'bar' })).toEqual({
      id: '1',
      name: 'foo',
      slug: 'bar',
    });
  });

  it('preserves null values', () => {
    expect(toSnakeCase({ validUntil: null, sessionId: null })).toEqual({
      valid_until: null,
      session_id: null,
    });
  });

  it('preserves arrays as-is', () => {
    const arr = ['tag1', 'tag2'];
    const result = toSnakeCase({ tags: arr });
    expect(result['tags']).toBe(arr);
  });

  it('preserves nested objects (metadata) without deep-converting keys', () => {
    const meta = { someKey: 'val', anotherOne: 123 };
    const result = toSnakeCase({ metadata: meta });
    // nested object is the same reference — keys are NOT converted
    expect(result['metadata']).toBe(meta);
    expect((result['metadata'] as Record<string, unknown>)['someKey']).toBe('val');
  });

  it('preserves nested config object without deep-converting keys', () => {
    const config = { extractionTier: 'tier1', maxFacts: 100 };
    const result = toSnakeCase({ config });
    expect(result['config']).toBe(config);
  });

  it('handles multiple fields at once', () => {
    const input = {
      tenantId: 'tid',
      scopeId: 'sid',
      validFrom: '2024-01-01',
      costTokensInput: 42,
      metadata: { foo: 'bar' },
    };
    expect(toSnakeCase(input)).toEqual({
      tenant_id: 'tid',
      scope_id: 'sid',
      valid_from: '2024-01-01',
      cost_tokens_input: 42,
      metadata: { foo: 'bar' },
    });
  });

  it('handles empty object', () => {
    expect(toSnakeCase({})).toEqual({});
  });
});

// =============================================================================
// snake_case → camelCase
// =============================================================================

describe('toCamelCase', () => {
  it('converts tenant_id → tenantId', () => {
    expect(toCamelCase({ tenant_id: 'abc' })).toEqual({ tenantId: 'abc' });
  });

  it('converts valid_from → validFrom', () => {
    const d = new Date('2024-01-01');
    expect(toCamelCase({ valid_from: d })).toEqual({ validFrom: d });
  });

  it('converts created_at → createdAt', () => {
    expect(toCamelCase({ created_at: '2024-01-01' })).toEqual({ createdAt: '2024-01-01' });
  });

  it('converts cost_tokens_input → costTokensInput', () => {
    expect(toCamelCase({ cost_tokens_input: 1000 })).toEqual({ costTokensInput: 1000 });
  });

  it('converts scope_id → scopeId', () => {
    expect(toCamelCase({ scope_id: 'u-123' })).toEqual({ scopeId: 'u-123' });
  });

  it('converts embedding_model → embeddingModel', () => {
    expect(toCamelCase({ embedding_model: 'text-embedding-3-small' })).toEqual({
      embeddingModel: 'text-embedding-3-small',
    });
  });

  it('converts lineage_id → lineageId', () => {
    expect(toCamelCase({ lineage_id: 'lid-001' })).toEqual({ lineageId: 'lid-001' });
  });

  it('converts key_hash → keyHash', () => {
    expect(toCamelCase({ key_hash: 'abc123' })).toEqual({ keyHash: 'abc123' });
  });

  it('converts key_prefix → keyPrefix', () => {
    expect(toCamelCase({ key_prefix: 'sk_' })).toEqual({ keyPrefix: 'sk_' });
  });

  it('converts input_hash → inputHash', () => {
    expect(toCamelCase({ input_hash: 'sha256xyz' })).toEqual({ inputHash: 'sha256xyz' });
  });

  it('converts input_type → inputType', () => {
    expect(toCamelCase({ input_type: 'text' })).toEqual({ inputType: 'text' });
  });

  it('converts tier_used → tierUsed', () => {
    expect(toCamelCase({ tier_used: 'tier2' })).toEqual({ tierUsed: 'tier2' });
  });

  it('converts facts_created → factsCreated', () => {
    expect(toCamelCase({ facts_created: 3 })).toEqual({ factsCreated: 3 });
  });

  it('converts cost_tokens_output → costTokensOutput', () => {
    expect(toCamelCase({ cost_tokens_output: 500 })).toEqual({ costTokensOutput: 500 });
  });

  it('converts period_start → periodStart', () => {
    expect(toCamelCase({ period_start: '2024-01-01' })).toEqual({ periodStart: '2024-01-01' });
  });

  it('converts tokens_used → tokensUsed', () => {
    expect(toCamelCase({ tokens_used: 999 })).toEqual({ tokensUsed: 999 });
  });

  it('converts last_used_at → lastUsedAt', () => {
    expect(toCamelCase({ last_used_at: null })).toEqual({ lastUsedAt: null });
  });

  it('preserves single-word keys unchanged', () => {
    expect(toCamelCase({ id: '1', name: 'foo', slug: 'bar' })).toEqual({
      id: '1',
      name: 'foo',
      slug: 'bar',
    });
  });

  it('preserves null values', () => {
    expect(toCamelCase({ valid_until: null, session_id: null })).toEqual({
      validUntil: null,
      sessionId: null,
    });
  });

  it('preserves arrays as-is', () => {
    const arr = ['tag1', 'tag2'];
    const result = toCamelCase({ tags: arr });
    expect(result['tags']).toBe(arr);
  });

  it('preserves nested objects (metadata) without deep-converting keys', () => {
    const meta = { some_key: 'val', another_one: 123 };
    const result = toCamelCase({ metadata: meta });
    expect(result['metadata']).toBe(meta);
    expect((result['metadata'] as Record<string, unknown>)['some_key']).toBe('val');
  });

  it('handles multiple fields at once', () => {
    const input = {
      tenant_id: 'tid',
      scope_id: 'sid',
      valid_from: '2024-01-01',
      cost_tokens_input: 42,
      metadata: { foo: 'bar' },
    };
    expect(toCamelCase(input)).toEqual({
      tenantId: 'tid',
      scopeId: 'sid',
      validFrom: '2024-01-01',
      costTokensInput: 42,
      metadata: { foo: 'bar' },
    });
  });

  it('handles empty object', () => {
    expect(toCamelCase({})).toEqual({});
  });
});

// =============================================================================
// Round-trip symmetry
// =============================================================================

describe('round-trip symmetry', () => {
  it('toSnakeCase then toCamelCase returns original keys', () => {
    const original = {
      tenantId: 'tid',
      scopeId: 'sid',
      validFrom: '2024-01-01',
      costTokensInput: 42,
      embeddingModel: 'model',
      lineageId: 'lid',
      createdAt: new Date(),
    };
    const snaked = toSnakeCase(original as unknown as Record<string, unknown>);
    const restored = toCamelCase(snaked);
    expect(restored).toEqual(original);
  });

  it('toCamelCase then toSnakeCase returns original keys', () => {
    const original = {
      tenant_id: 'tid',
      scope_id: 'sid',
      valid_from: '2024-01-01',
      cost_tokens_input: 42,
      embedding_model: 'model',
      lineage_id: 'lid',
    };
    const cameled = toCamelCase(original);
    const restored = toSnakeCase(cameled as Record<string, unknown>);
    expect(restored).toEqual(original);
  });
});

// =============================================================================
// Table name correctness — verified via a mock Supabase client
// =============================================================================

function makeMockClient() {
  // Tracks the table name used in the most recent .from() call
  const calls: { table: string; method: string }[] = [];

  const chainable = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: {}, error: null }),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    limit: vi.fn().mockReturnThis(),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  };

  const from = vi.fn((table: string) => {
    calls.push({ table, method: 'from' });
    return chainable;
  });

  const rpc = vi.fn((_fn: string) => {
    calls.push({ table: 'rpc', method: 'rpc' });
    return Promise.resolve({ data: [], error: null });
  });

  const client = { from, rpc, calls, chainable };
  return client;
}

describe('SupabaseStorageAdapter table names', () => {
  let mock: ReturnType<typeof makeMockClient>;
  let adapter: SupabaseStorageAdapter;

  beforeEach(() => {
    mock = makeMockClient();
    adapter = new SupabaseStorageAdapter(mock as unknown as Parameters<typeof SupabaseStorageAdapter.prototype.constructor>[0]);
  });

  it('ping() uses the tenants table', async () => {
    await adapter.ping();
    expect(mock.from).toHaveBeenCalledWith('tenants');
  });

  it('getTenant() uses the tenants table', async () => {
    await adapter.getTenant('00000000-0000-0000-0000-000000000001');
    expect(mock.from).toHaveBeenCalledWith('tenants');
  });

  it('getTenantBySlug() uses the tenants table', async () => {
    await adapter.getTenantBySlug('my-slug');
    expect(mock.from).toHaveBeenCalledWith('tenants');
  });

  it('getApiKeyByPrefix() uses the api_keys table', async () => {
    await adapter.getApiKeyByPrefix('sk_');
    expect(mock.from).toHaveBeenCalledWith('api_keys');
  });

  it('getApiKeysForTenant() uses the api_keys table', async () => {
    mock.chainable.eq.mockResolvedValueOnce({ data: [], error: null });
    await adapter.getApiKeysForTenant('00000000-0000-0000-0000-000000000001');
    expect(mock.from).toHaveBeenCalledWith('api_keys');
  });

  it('getExtraction() uses the extractions table', async () => {
    await adapter.getExtraction(
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
    );
    expect(mock.from).toHaveBeenCalledWith('extractions');
  });

  it('getExtractionByHash() uses the extractions table', async () => {
    await adapter.getExtractionByHash('00000000-0000-0000-0000-000000000001', 'hash123');
    expect(mock.from).toHaveBeenCalledWith('extractions');
  });

  it('getFact() uses the facts table', async () => {
    await adapter.getFact(
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
    );
    expect(mock.from).toHaveBeenCalledWith('facts');
  });

  it('getFactsByLineage() uses the facts table', async () => {
    await adapter.getFactsByLineage('00000000-0000-0000-0000-000000000001', 'lid-001');
    expect(mock.from).toHaveBeenCalledWith('facts');
  });

  it('getEntity() uses the entities table', async () => {
    await adapter.getEntity(
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
    );
    expect(mock.from).toHaveBeenCalledWith('entities');
  });

  it('findEntityByCanonicalName() uses the entities table', async () => {
    await adapter.findEntityByCanonicalName(
      '00000000-0000-0000-0000-000000000001',
      'Alice',
      'person',
    );
    expect(mock.from).toHaveBeenCalledWith('entities');
  });

  it('linkFactEntity() uses the fact_entities table', async () => {
    mock.chainable.insert.mockResolvedValueOnce({ data: null, error: null });
    await adapter.linkFactEntity(
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
      'subject',
    );
    expect(mock.from).toHaveBeenCalledWith('fact_entities');
  });

  it('getUsage() uses the usage_records table', async () => {
    await adapter.getUsage('00000000-0000-0000-0000-000000000001', new Date());
    expect(mock.from).toHaveBeenCalledWith('usage_records');
  });

  it('getCurrentUsage() uses the usage_records table', async () => {
    await adapter.getCurrentUsage('00000000-0000-0000-0000-000000000001');
    expect(mock.from).toHaveBeenCalledWith('usage_records');
  });
});

// =============================================================================
// Input validation — Zod schemas catch invalid data
// =============================================================================

describe('Zod schema validation', () => {
  it('FactSchema rejects fact with missing required tenantId', async () => {
    const { FactSchema } = await import('@steno-ai/engine');
    const result = FactSchema.safeParse({
      id: '00000000-0000-0000-0000-000000000001',
      // tenantId intentionally missing
      scope: 'user',
      scopeId: '00000000-0000-0000-0000-000000000002',
      content: 'hello',
      version: 1,
      lineageId: '00000000-0000-0000-0000-000000000003',
      validFrom: new Date(),
      validUntil: null,
      operation: 'create',
      importance: 0.5,
      confidence: 0.8,
      decayScore: 1.0,
      frequency: 1,
      contradictionStatus: 'none',
      modality: 'text',
      tags: [],
      metadata: {},
      createdAt: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it('ExtractionSchema rejects invalid status', async () => {
    const { ExtractionSchema } = await import('@steno-ai/engine');
    const result = ExtractionSchema.safeParse({
      id: '00000000-0000-0000-0000-000000000001',
      tenantId: '00000000-0000-0000-0000-000000000002',
      status: 'invalid_status',
      inputType: 'raw_text',
      inputData: null,
      inputHash: 'abc',
      inputSize: 5,
      scope: 'user',
      scopeId: '00000000-0000-0000-0000-000000000003',
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
      costUsd: 0,
      durationMs: null,
      error: null,
      retryCount: 0,
      createdAt: new Date(),
      completedAt: null,
    });
    expect(result.success).toBe(false);
  });

  it('TenantSchema rejects slug with uppercase letters', async () => {
    const { TenantSchema } = await import('@steno-ai/engine');
    const result = TenantSchema.safeParse({
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Test',
      slug: 'My-Slug',
      config: {},
      plan: 'free',
      tokenLimitMonthly: 1000000,
      queryLimitMonthly: 10000,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it('ApiKeySchema rejects negative importance (fact) — unit float check', async () => {
    const { FactSchema } = await import('@steno-ai/engine');
    const result = FactSchema.safeParse({
      id: '00000000-0000-0000-0000-000000000001',
      tenantId: '00000000-0000-0000-0000-000000000002',
      scope: 'user',
      scopeId: '00000000-0000-0000-0000-000000000003',
      sessionId: null,
      content: 'hello',
      version: 1,
      lineageId: '00000000-0000-0000-0000-000000000004',
      validFrom: new Date(),
      validUntil: null,
      operation: 'create',
      importance: -0.1, // invalid
      confidence: 0.8,
      decayScore: 1.0,
      frequency: 1,
      contradictionStatus: 'none',
      modality: 'text',
      tags: [],
      metadata: {},
      createdAt: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it('CreateExtractionSchema validates a correct object', async () => {
    const { CreateExtractionSchema } = await import('@steno-ai/engine');
    const result = CreateExtractionSchema.safeParse({
      tenantId: '00000000-0000-0000-0000-000000000001',
      inputType: 'raw_text',
      inputData: 'some text to extract from',
      inputHash: 'abc123hash',
      scope: 'user',
      scopeId: '00000000-0000-0000-0000-000000000002',
    });
    expect(result.success).toBe(true);
  });
});

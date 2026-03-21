import { describe, it, expect } from 'vitest';
import { FactSchema, CreateFactSchema } from '../../src/models/fact.js';

const validUuid = '00000000-0000-0000-0000-000000000001';
const validUuid2 = '00000000-0000-0000-0000-000000000002';

const baseFullFact = {
  id: validUuid,
  tenantId: validUuid,
  scope: 'user' as const,
  scopeId: validUuid,
  sessionId: null,
  content: 'User prefers dark mode.',
  embeddingModel: 'text-embedding-3-small',
  embeddingDim: 1536,
  version: 1,
  lineageId: validUuid,
  validFrom: new Date('2024-01-01'),
  validUntil: null,
  operation: 'create' as const,
  parentId: null,
  importance: 0.5,
  frequency: 0,
  lastAccessed: null,
  decayScore: 1.0,
  contradictionStatus: 'none' as const,
  contradictsId: null,
  sourceType: 'conversation' as const,
  sourceRef: null,
  confidence: 0.8,
  originalContent: null,
  extractionId: null,
  extractionTier: null,
  modality: 'text' as const,
  tags: [],
  metadata: {},
  createdAt: new Date('2024-01-01'),
};

describe('FactSchema', () => {
  it('accepts valid full fact row', () => {
    expect(() => FactSchema.parse(baseFullFact)).not.toThrow();
  });

  it('rejects invalid scope enum', () => {
    const result = FactSchema.safeParse({ ...baseFullFact, scope: 'global' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid operation enum', () => {
    const result = FactSchema.safeParse({ ...baseFullFact, operation: 'delete' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid contradictionStatus enum', () => {
    const result = FactSchema.safeParse({ ...baseFullFact, contradictionStatus: 'pending' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid modality enum', () => {
    const result = FactSchema.safeParse({ ...baseFullFact, modality: 'video' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid extractionTier enum', () => {
    const result = FactSchema.safeParse({ ...baseFullFact, extractionTier: 'ultra_llm' });
    expect(result.success).toBe(false);
  });

  it('rejects missing required field tenantId', () => {
    const { tenantId: _t, ...rest } = baseFullFact;
    const result = FactSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects missing required field content', () => {
    const { content: _c, ...rest } = baseFullFact;
    const result = FactSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects content exceeding 50000 chars', () => {
    const result = FactSchema.safeParse({ ...baseFullFact, content: 'x'.repeat(50001) });
    expect(result.success).toBe(false);
  });

  it('accepts content at exactly 50000 chars', () => {
    const result = FactSchema.safeParse({ ...baseFullFact, content: 'x'.repeat(50000) });
    expect(result.success).toBe(true);
  });

  it('rejects importance below 0', () => {
    const result = FactSchema.safeParse({ ...baseFullFact, importance: -0.1 });
    expect(result.success).toBe(false);
  });

  it('rejects importance above 1', () => {
    const result = FactSchema.safeParse({ ...baseFullFact, importance: 1.1 });
    expect(result.success).toBe(false);
  });

  it('rejects confidence below 0', () => {
    const result = FactSchema.safeParse({ ...baseFullFact, confidence: -0.1 });
    expect(result.success).toBe(false);
  });

  it('rejects confidence above 1', () => {
    const result = FactSchema.safeParse({ ...baseFullFact, confidence: 1.1 });
    expect(result.success).toBe(false);
  });

  it('rejects tags array exceeding 20 items', () => {
    const result = FactSchema.safeParse({
      ...baseFullFact,
      tags: Array.from({ length: 21 }, (_, i) => `tag${i}`),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a tag exceeding 100 chars', () => {
    const result = FactSchema.safeParse({ ...baseFullFact, tags: ['x'.repeat(101)] });
    expect(result.success).toBe(false);
  });

  it('accepts tags at boundary (20 items, 100 chars each)', () => {
    const result = FactSchema.safeParse({
      ...baseFullFact,
      tags: Array.from({ length: 20 }, () => 'x'.repeat(100)),
    });
    expect(result.success).toBe(true);
  });

  it('accepts null nullable fields', () => {
    const result = FactSchema.safeParse({
      ...baseFullFact,
      sessionId: null,
      validUntil: null,
      parentId: null,
      lastAccessed: null,
      contradictsId: null,
      sourceRef: null,
      originalContent: null,
      extractionId: null,
      extractionTier: null,
      embeddingModel: null,
      embeddingDim: null,
    });
    expect(result.success).toBe(true);
  });

  it('coerces string dates to Date objects', () => {
    const result = FactSchema.safeParse({
      ...baseFullFact,
      validFrom: '2024-01-01T00:00:00.000Z',
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.validFrom).toBeInstanceOf(Date);
      expect(result.data.createdAt).toBeInstanceOf(Date);
    }
  });

  it('validates UUID fields', () => {
    const result = FactSchema.safeParse({ ...baseFullFact, id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('accepts all scope enum values', () => {
    for (const scope of ['user', 'agent', 'session', 'hive'] as const) {
      const result = FactSchema.safeParse({ ...baseFullFact, scope });
      expect(result.success).toBe(true);
    }
  });
});

describe('CreateFactSchema', () => {
  const baseCreate = {
    tenantId: validUuid,
    scope: 'user' as const,
    scopeId: validUuid2,
    content: 'A test fact.',
  };

  it('accepts minimal valid input with defaults', () => {
    const result = CreateFactSchema.safeParse(baseCreate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.importance).toBe(0.5);
      expect(result.data.confidence).toBe(0.8);
      expect(result.data.operation).toBe('create');
      expect(result.data.modality).toBe('text');
      expect(result.data.tags).toEqual([]);
      expect(result.data.metadata).toEqual({});
      expect(result.data.contradictionStatus).toBe('none');
    }
  });

  it('rejects missing tenantId', () => {
    const { tenantId: _t, ...rest } = baseCreate;
    const result = CreateFactSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects missing scope', () => {
    const { scope: _s, ...rest } = baseCreate;
    const result = CreateFactSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects missing content', () => {
    const { content: _c, ...rest } = baseCreate;
    const result = CreateFactSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('allows optional fields to be omitted', () => {
    const result = CreateFactSchema.safeParse(baseCreate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sessionId).toBeUndefined();
      expect(result.data.extractionId).toBeUndefined();
    }
  });

  it('rejects invalid importance boundary', () => {
    const result = CreateFactSchema.safeParse({ ...baseCreate, importance: 1.01 });
    expect(result.success).toBe(false);
  });

  it('accepts importance at boundary values 0 and 1', () => {
    expect(CreateFactSchema.safeParse({ ...baseCreate, importance: 0 }).success).toBe(true);
    expect(CreateFactSchema.safeParse({ ...baseCreate, importance: 1 }).success).toBe(true);
  });
});

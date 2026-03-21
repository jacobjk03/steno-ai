import { describe, it, expect } from 'vitest';
import { EdgeSchema, CreateEdgeSchema } from '../../src/models/edge.js';

const validUuid = '00000000-0000-0000-0000-000000000001';

const baseEdge = {
  id: validUuid,
  tenantId: validUuid,
  sourceId: validUuid,
  targetId: validUuid,
  relation: 'knows',
  edgeType: 'associative' as const,
  weight: 1.0,
  validFrom: new Date('2024-01-01'),
  validUntil: null,
  factId: null,
  confidence: 0.8,
  metadata: {},
  createdAt: new Date('2024-01-01'),
};

describe('EdgeSchema', () => {
  it('accepts a valid edge row', () => {
    expect(() => EdgeSchema.parse(baseEdge)).not.toThrow();
  });

  it('rejects invalid edgeType enum', () => {
    const result = EdgeSchema.safeParse({ ...baseEdge, edgeType: 'unknown' });
    expect(result.success).toBe(false);
  });

  it('accepts all valid edgeType values', () => {
    for (const edgeType of ['associative', 'causal', 'temporal', 'contradictory', 'hierarchical'] as const) {
      const result = EdgeSchema.safeParse({ ...baseEdge, edgeType });
      expect(result.success).toBe(true);
    }
  });

  it('rejects missing tenantId', () => {
    const { tenantId: _t, ...rest } = baseEdge;
    const result = EdgeSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects missing sourceId', () => {
    const { sourceId: _s, ...rest } = baseEdge;
    const result = EdgeSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects confidence above 1', () => {
    const result = EdgeSchema.safeParse({ ...baseEdge, confidence: 1.1 });
    expect(result.success).toBe(false);
  });

  it('rejects confidence below 0', () => {
    const result = EdgeSchema.safeParse({ ...baseEdge, confidence: -0.1 });
    expect(result.success).toBe(false);
  });

  it('accepts confidence at boundaries 0 and 1', () => {
    expect(EdgeSchema.safeParse({ ...baseEdge, confidence: 0 }).success).toBe(true);
    expect(EdgeSchema.safeParse({ ...baseEdge, confidence: 1 }).success).toBe(true);
  });

  it('accepts nullable validUntil', () => {
    const result = EdgeSchema.safeParse({ ...baseEdge, validUntil: null });
    expect(result.success).toBe(true);
  });

  it('coerces null validFrom to Date (epoch) — NOT nullable in type', () => {
    // z.coerce.date() will coerce null to new Date(0) (epoch).
    // The schema intentionally does NOT have .nullable() so the TypeScript
    // type enforces a Date value; the SQL column is NOT NULL DEFAULT NOW().
    const result = EdgeSchema.safeParse({ ...baseEdge, validFrom: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.validFrom).toBeInstanceOf(Date);
    }
  });

  it('accepts nullable factId', () => {
    const result = EdgeSchema.safeParse({ ...baseEdge, factId: null });
    expect(result.success).toBe(true);
  });

  it('accepts valid factId uuid', () => {
    const result = EdgeSchema.safeParse({ ...baseEdge, factId: validUuid });
    expect(result.success).toBe(true);
  });

  it('rejects invalid factId uuid', () => {
    const result = EdgeSchema.safeParse({ ...baseEdge, factId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('coerces string dates', () => {
    const result = EdgeSchema.safeParse({
      ...baseEdge,
      validFrom: '2024-01-01T00:00:00.000Z',
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.validFrom).toBeInstanceOf(Date);
    }
  });
});

describe('CreateEdgeSchema', () => {
  const baseCreate = {
    tenantId: validUuid,
    sourceId: validUuid,
    targetId: validUuid,
    relation: 'knows',
    edgeType: 'associative' as const,
  };

  it('applies defaults for weight, confidence, and metadata', () => {
    const result = CreateEdgeSchema.safeParse(baseCreate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.weight).toBe(1.0);
      expect(result.data.confidence).toBe(0.8);
      expect(result.data.metadata).toEqual({});
    }
  });

  it('rejects missing relation', () => {
    const { relation: _r, ...rest } = baseCreate;
    const result = CreateEdgeSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects invalid edgeType', () => {
    const result = CreateEdgeSchema.safeParse({ ...baseCreate, edgeType: 'random' });
    expect(result.success).toBe(false);
  });

  it('factId is optional', () => {
    const result = CreateEdgeSchema.safeParse(baseCreate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.factId).toBeUndefined();
    }
  });
});

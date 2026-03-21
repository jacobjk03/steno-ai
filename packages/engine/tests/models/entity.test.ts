import { describe, it, expect } from 'vitest';
import { EntitySchema, CreateEntitySchema } from '../../src/models/entity.js';

const validUuid = '00000000-0000-0000-0000-000000000001';

const baseEntity = {
  id: validUuid,
  tenantId: validUuid,
  name: 'Alice',
  entityType: 'person',
  canonicalName: 'alice',
  properties: {},
  embeddingModel: null,
  embeddingDim: null,
  mergeTargetId: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

describe('EntitySchema', () => {
  it('accepts a valid entity row', () => {
    expect(() => EntitySchema.parse(baseEntity)).not.toThrow();
  });

  it('rejects missing required field name', () => {
    const { name: _n, ...rest } = baseEntity;
    const result = EntitySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects missing required field tenantId', () => {
    const { tenantId: _t, ...rest } = baseEntity;
    const result = EntitySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects name exceeding 500 chars', () => {
    const result = EntitySchema.safeParse({ ...baseEntity, name: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });

  it('accepts name at exactly 500 chars', () => {
    const result = EntitySchema.safeParse({ ...baseEntity, name: 'x'.repeat(500) });
    expect(result.success).toBe(true);
  });

  it('accepts nullable embeddingModel and embeddingDim', () => {
    const result = EntitySchema.safeParse({ ...baseEntity, embeddingModel: null, embeddingDim: null });
    expect(result.success).toBe(true);
  });

  it('accepts valid embeddingDim as positive int', () => {
    const result = EntitySchema.safeParse({ ...baseEntity, embeddingModel: 'model', embeddingDim: 1536 });
    expect(result.success).toBe(true);
  });

  it('rejects non-positive embeddingDim', () => {
    const result = EntitySchema.safeParse({ ...baseEntity, embeddingModel: 'model', embeddingDim: 0 });
    expect(result.success).toBe(false);
  });

  it('accepts nullable mergeTargetId', () => {
    const result = EntitySchema.safeParse({ ...baseEntity, mergeTargetId: null });
    expect(result.success).toBe(true);
  });

  it('accepts mergeTargetId as valid uuid', () => {
    const result = EntitySchema.safeParse({ ...baseEntity, mergeTargetId: validUuid });
    expect(result.success).toBe(true);
  });

  it('rejects mergeTargetId as invalid uuid', () => {
    const result = EntitySchema.safeParse({ ...baseEntity, mergeTargetId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('coerces string dates', () => {
    const result = EntitySchema.safeParse({
      ...baseEntity,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.createdAt).toBeInstanceOf(Date);
    }
  });

  it('accepts properties as a record', () => {
    const result = EntitySchema.safeParse({ ...baseEntity, properties: { age: 30, active: true } });
    expect(result.success).toBe(true);
  });
});

describe('CreateEntitySchema', () => {
  const baseCreate = {
    tenantId: validUuid,
    name: 'Bob',
    entityType: 'person',
    canonicalName: 'bob',
  };

  it('applies default properties as empty object', () => {
    const result = CreateEntitySchema.safeParse(baseCreate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.properties).toEqual({});
    }
  });

  it('rejects missing tenantId', () => {
    const { tenantId: _t, ...rest } = baseCreate;
    const result = CreateEntitySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects missing name', () => {
    const { name: _n, ...rest } = baseCreate;
    const result = CreateEntitySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects name exceeding 500 chars', () => {
    const result = CreateEntitySchema.safeParse({ ...baseCreate, name: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });

  it('accepts custom properties', () => {
    const result = CreateEntitySchema.safeParse({ ...baseCreate, properties: { role: 'admin' } });
    expect(result.success).toBe(true);
  });
});

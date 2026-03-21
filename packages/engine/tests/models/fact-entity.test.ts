import { describe, it, expect } from 'vitest';
import { FactEntitySchema, CreateFactEntitySchema } from '../../src/models/fact-entity.js';

const validUuid = '00000000-0000-0000-0000-000000000001';
const validUuid2 = '00000000-0000-0000-0000-000000000002';

const baseFactEntity = {
  factId: validUuid,
  entityId: validUuid2,
  role: 'mentioned' as const,
  createdAt: new Date('2024-01-01'),
};

describe('FactEntitySchema', () => {
  it('accepts a valid fact-entity row', () => {
    expect(() => FactEntitySchema.parse(baseFactEntity)).not.toThrow();
  });

  it('rejects invalid role enum', () => {
    const result = FactEntitySchema.safeParse({ ...baseFactEntity, role: 'participant' });
    expect(result.success).toBe(false);
  });

  it('accepts all valid role values', () => {
    for (const role of ['subject', 'object', 'mentioned'] as const) {
      const result = FactEntitySchema.safeParse({ ...baseFactEntity, role });
      expect(result.success).toBe(true);
    }
  });

  it('rejects missing factId', () => {
    const { factId: _f, ...rest } = baseFactEntity;
    const result = FactEntitySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects missing entityId', () => {
    const { entityId: _e, ...rest } = baseFactEntity;
    const result = FactEntitySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects invalid factId uuid', () => {
    const result = FactEntitySchema.safeParse({ ...baseFactEntity, factId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid entityId uuid', () => {
    const result = FactEntitySchema.safeParse({ ...baseFactEntity, entityId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('coerces string createdAt to Date', () => {
    const result = FactEntitySchema.safeParse({
      ...baseFactEntity,
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.createdAt).toBeInstanceOf(Date);
    }
  });
});

describe('CreateFactEntitySchema', () => {
  it('applies default role as mentioned', () => {
    const result = CreateFactEntitySchema.safeParse({
      factId: validUuid,
      entityId: validUuid2,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe('mentioned');
    }
  });

  it('rejects missing factId', () => {
    const result = CreateFactEntitySchema.safeParse({ entityId: validUuid2 });
    expect(result.success).toBe(false);
  });

  it('rejects missing entityId', () => {
    const result = CreateFactEntitySchema.safeParse({ factId: validUuid });
    expect(result.success).toBe(false);
  });

  it('accepts custom role', () => {
    const result = CreateFactEntitySchema.safeParse({
      factId: validUuid,
      entityId: validUuid2,
      role: 'subject',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe('subject');
    }
  });

  it('rejects invalid role', () => {
    const result = CreateFactEntitySchema.safeParse({
      factId: validUuid,
      entityId: validUuid2,
      role: 'author',
    });
    expect(result.success).toBe(false);
  });
});

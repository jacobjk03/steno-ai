import { describe, it, expect } from 'vitest';
import { TriggerSchema, CreateTriggerSchema, TriggerConditionSchema } from '../../src/models/trigger.js';

const validUuid = '00000000-0000-0000-0000-000000000001';

const baseTrigger = {
  id: validUuid,
  tenantId: validUuid,
  scope: 'user' as const,
  scopeId: validUuid,
  condition: { keyword_any: ['meeting', 'schedule'] },
  factIds: [],
  entityIds: [],
  queryTemplate: null,
  priority: 0,
  active: true,
  timesFired: 0,
  lastFiredAt: null,
  createdAt: new Date('2024-01-01'),
};

describe('TriggerConditionSchema', () => {
  it('accepts a keyword_any condition', () => {
    const result = TriggerConditionSchema.safeParse({ keyword_any: ['foo', 'bar'] });
    expect(result.success).toBe(true);
  });

  it('accepts a topic_match condition', () => {
    const result = TriggerConditionSchema.safeParse({ topic_match: ['work'] });
    expect(result.success).toBe(true);
  });

  it('accepts a semantic_similarity condition', () => {
    const result = TriggerConditionSchema.safeParse({
      semantic_similarity: { text: 'some query', threshold: 0.8 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects semantic_similarity with threshold above 1', () => {
    const result = TriggerConditionSchema.safeParse({
      semantic_similarity: { text: 'query', threshold: 1.1 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects semantic_similarity with threshold below 0', () => {
    const result = TriggerConditionSchema.safeParse({
      semantic_similarity: { text: 'query', threshold: -0.1 },
    });
    expect(result.success).toBe(false);
  });

  it('accepts nested AND condition', () => {
    const result = TriggerConditionSchema.safeParse({
      AND: [{ keyword_any: ['foo'] }, { topic_match: ['bar'] }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts nested OR condition', () => {
    const result = TriggerConditionSchema.safeParse({
      OR: [{ keyword_any: ['foo'] }, { entity_present: ['alice'] }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts deeply nested AND/OR', () => {
    const result = TriggerConditionSchema.safeParse({
      AND: [
        { OR: [{ keyword_any: ['x'] }, { topic_match: ['y'] }] },
        { entity_present: ['z'] },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('TriggerSchema', () => {
  it('accepts a valid trigger row', () => {
    expect(() => TriggerSchema.parse(baseTrigger)).not.toThrow();
  });

  it('rejects invalid scope enum', () => {
    const result = TriggerSchema.safeParse({ ...baseTrigger, scope: 'global' });
    expect(result.success).toBe(false);
  });

  it('accepts all valid scope values', () => {
    for (const scope of ['user', 'agent', 'session', 'hive'] as const) {
      const result = TriggerSchema.safeParse({ ...baseTrigger, scope });
      expect(result.success).toBe(true);
    }
  });

  it('rejects missing tenantId', () => {
    const { tenantId: _t, ...rest } = baseTrigger;
    const result = TriggerSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('accepts nullable queryTemplate and lastFiredAt', () => {
    const result = TriggerSchema.safeParse({ ...baseTrigger, queryTemplate: null, lastFiredAt: null });
    expect(result.success).toBe(true);
  });

  it('accepts factIds as array of uuids', () => {
    const result = TriggerSchema.safeParse({ ...baseTrigger, factIds: [validUuid] });
    expect(result.success).toBe(true);
  });

  it('rejects factIds with invalid uuid', () => {
    const result = TriggerSchema.safeParse({ ...baseTrigger, factIds: ['not-a-uuid'] });
    expect(result.success).toBe(false);
  });

  it('coerces string dates', () => {
    const result = TriggerSchema.safeParse({
      ...baseTrigger,
      lastFiredAt: '2024-06-01T00:00:00.000Z',
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lastFiredAt).toBeInstanceOf(Date);
    }
  });
});

describe('CreateTriggerSchema', () => {
  const baseCreate = {
    tenantId: validUuid,
    scope: 'user' as const,
    scopeId: validUuid,
    condition: { keyword_any: ['reminder'] },
  };

  it('applies defaults for factIds, entityIds, priority', () => {
    const result = CreateTriggerSchema.safeParse(baseCreate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.factIds).toEqual([]);
      expect(result.data.entityIds).toEqual([]);
      expect(result.data.priority).toBe(0);
    }
  });

  it('rejects missing condition', () => {
    const { condition: _c, ...rest } = baseCreate;
    const result = CreateTriggerSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('queryTemplate is optional', () => {
    const result = CreateTriggerSchema.safeParse(baseCreate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.queryTemplate).toBeUndefined();
    }
  });

  it('accepts custom factIds and entityIds', () => {
    const result = CreateTriggerSchema.safeParse({
      ...baseCreate,
      factIds: [validUuid],
      entityIds: [validUuid],
    });
    expect(result.success).toBe(true);
  });
});

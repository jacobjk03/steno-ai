import { describe, it, expect } from 'vitest';
import { UsageRecordSchema } from '../../src/models/usage-record.js';

const validUuid = '00000000-0000-0000-0000-000000000001';

const baseUsageRecord = {
  id: validUuid,
  tenantId: validUuid,
  periodStart: new Date('2024-01-01'),
  periodEnd: new Date('2024-01-31'),
  tokensUsed: 5000,
  queriesUsed: 100,
  extractionsCount: 20,
  costUsd: 1.5,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-31'),
};

describe('UsageRecordSchema', () => {
  it('accepts a valid usage record row', () => {
    expect(() => UsageRecordSchema.parse(baseUsageRecord)).not.toThrow();
  });

  it('rejects missing tenantId', () => {
    const { tenantId: _t, ...rest } = baseUsageRecord;
    const result = UsageRecordSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects missing periodStart', () => {
    const { periodStart: _p, ...rest } = baseUsageRecord;
    const result = UsageRecordSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects missing periodEnd', () => {
    const { periodEnd: _p, ...rest } = baseUsageRecord;
    const result = UsageRecordSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects negative tokensUsed', () => {
    const result = UsageRecordSchema.safeParse({ ...baseUsageRecord, tokensUsed: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects negative queriesUsed', () => {
    const result = UsageRecordSchema.safeParse({ ...baseUsageRecord, queriesUsed: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects negative extractionsCount', () => {
    const result = UsageRecordSchema.safeParse({ ...baseUsageRecord, extractionsCount: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects negative costUsd', () => {
    const result = UsageRecordSchema.safeParse({ ...baseUsageRecord, costUsd: -0.01 });
    expect(result.success).toBe(false);
  });

  it('accepts zero values for counts and cost', () => {
    const result = UsageRecordSchema.safeParse({
      ...baseUsageRecord,
      tokensUsed: 0,
      queriesUsed: 0,
      extractionsCount: 0,
      costUsd: 0,
    });
    expect(result.success).toBe(true);
  });

  it('coerces string dates', () => {
    const result = UsageRecordSchema.safeParse({
      ...baseUsageRecord,
      periodStart: '2024-01-01T00:00:00.000Z',
      periodEnd: '2024-01-31T00:00:00.000Z',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-31T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.periodStart).toBeInstanceOf(Date);
      expect(result.data.periodEnd).toBeInstanceOf(Date);
    }
  });

  it('validates id as UUID', () => {
    const result = UsageRecordSchema.safeParse({ ...baseUsageRecord, id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });
});

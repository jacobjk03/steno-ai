import { describe, it, expect } from 'vitest';
import {
  MemoryAccessSchema,
  CreateMemoryAccessSchema,
  SubmitFeedbackSchema,
} from '../../src/models/memory-access.js';

const validUuid = '00000000-0000-0000-0000-000000000001';

const baseAccess = {
  id: validUuid,
  tenantId: validUuid,
  factId: validUuid,
  query: 'what does the user prefer?',
  retrievalMethod: 'vector',
  similarityScore: null,
  rankPosition: null,
  wasUseful: null,
  wasCorrected: false,
  feedbackType: null,
  feedbackDetail: null,
  triggerId: null,
  accessedAt: new Date('2024-01-01'),
};

describe('MemoryAccessSchema', () => {
  it('accepts a valid memory access row', () => {
    expect(() => MemoryAccessSchema.parse(baseAccess)).not.toThrow();
  });

  it('rejects missing tenantId', () => {
    const { tenantId: _t, ...rest } = baseAccess;
    const result = MemoryAccessSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects missing factId', () => {
    const { factId: _f, ...rest } = baseAccess;
    const result = MemoryAccessSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects invalid feedbackType enum', () => {
    const result = MemoryAccessSchema.safeParse({ ...baseAccess, feedbackType: 'thumbs_up' });
    expect(result.success).toBe(false);
  });

  it('accepts all valid feedbackType values', () => {
    for (const feedbackType of [
      'implicit_positive',
      'implicit_negative',
      'explicit_positive',
      'explicit_negative',
      'correction',
    ] as const) {
      const result = MemoryAccessSchema.safeParse({ ...baseAccess, feedbackType });
      expect(result.success).toBe(true);
    }
  });

  it('accepts nullable similarityScore', () => {
    const result = MemoryAccessSchema.safeParse({ ...baseAccess, similarityScore: null });
    expect(result.success).toBe(true);
  });

  it('rejects similarityScore above 1', () => {
    const result = MemoryAccessSchema.safeParse({ ...baseAccess, similarityScore: 1.1 });
    expect(result.success).toBe(false);
  });

  it('rejects similarityScore below 0', () => {
    const result = MemoryAccessSchema.safeParse({ ...baseAccess, similarityScore: -0.1 });
    expect(result.success).toBe(false);
  });

  it('accepts similarityScore at boundaries 0 and 1', () => {
    expect(MemoryAccessSchema.safeParse({ ...baseAccess, similarityScore: 0 }).success).toBe(true);
    expect(MemoryAccessSchema.safeParse({ ...baseAccess, similarityScore: 1 }).success).toBe(true);
  });

  it('accepts nullable rankPosition', () => {
    const result = MemoryAccessSchema.safeParse({ ...baseAccess, rankPosition: null });
    expect(result.success).toBe(true);
  });

  it('accepts rankPosition as non-negative integer', () => {
    const result = MemoryAccessSchema.safeParse({ ...baseAccess, rankPosition: 0 });
    expect(result.success).toBe(true);
  });

  it('accepts nullable triggerId', () => {
    const result = MemoryAccessSchema.safeParse({ ...baseAccess, triggerId: null });
    expect(result.success).toBe(true);
  });

  it('rejects invalid triggerId uuid', () => {
    const result = MemoryAccessSchema.safeParse({ ...baseAccess, triggerId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('coerces string accessedAt to Date', () => {
    const result = MemoryAccessSchema.safeParse({
      ...baseAccess,
      accessedAt: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.accessedAt).toBeInstanceOf(Date);
    }
  });
});

describe('CreateMemoryAccessSchema', () => {
  const baseCreate = {
    tenantId: validUuid,
    factId: validUuid,
    query: 'user preferences?',
    retrievalMethod: 'vector',
  };

  it('accepts minimal valid input', () => {
    const result = CreateMemoryAccessSchema.safeParse(baseCreate);
    expect(result.success).toBe(true);
  });

  it('rejects missing query', () => {
    const { query: _q, ...rest } = baseCreate;
    const result = CreateMemoryAccessSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('optional fields are omitted by default', () => {
    const result = CreateMemoryAccessSchema.safeParse(baseCreate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.similarityScore).toBeUndefined();
      expect(result.data.rankPosition).toBeUndefined();
      expect(result.data.triggerId).toBeUndefined();
    }
  });
});

describe('SubmitFeedbackSchema', () => {
  it('accepts valid feedback', () => {
    const result = SubmitFeedbackSchema.safeParse({
      factId: validUuid,
      wasUseful: true,
      feedbackType: 'explicit_positive',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing factId', () => {
    const result = SubmitFeedbackSchema.safeParse({
      wasUseful: true,
      feedbackType: 'explicit_positive',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid feedbackType', () => {
    const result = SubmitFeedbackSchema.safeParse({
      factId: validUuid,
      wasUseful: true,
      feedbackType: 'thumbs_up',
    });
    expect(result.success).toBe(false);
  });

  it('feedbackDetail is optional', () => {
    const result = SubmitFeedbackSchema.safeParse({
      factId: validUuid,
      wasUseful: false,
      feedbackType: 'correction',
      feedbackDetail: 'Actually it was different.',
    });
    expect(result.success).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { ExtractionSchema, CreateExtractionSchema } from '../../src/models/extraction.js';

const validUuid = '00000000-0000-0000-0000-000000000001';

const baseExtraction = {
  id: validUuid,
  tenantId: validUuid,
  status: 'queued' as const,
  inputType: 'conversation' as const,
  inputData: null,
  inputHash: 'abc123',
  inputSize: null,
  scope: 'user' as const,
  scopeId: validUuid,
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
  createdAt: new Date('2024-01-01'),
  completedAt: null,
};

describe('ExtractionSchema', () => {
  it('accepts a valid extraction row', () => {
    expect(() => ExtractionSchema.parse(baseExtraction)).not.toThrow();
  });

  it('rejects invalid status enum', () => {
    const result = ExtractionSchema.safeParse({ ...baseExtraction, status: 'cancelled' });
    expect(result.success).toBe(false);
  });

  it('accepts all valid status values', () => {
    for (const status of ['queued', 'processing', 'completed', 'failed', 'deduped'] as const) {
      const result = ExtractionSchema.safeParse({ ...baseExtraction, status });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid inputType enum', () => {
    const result = ExtractionSchema.safeParse({ ...baseExtraction, inputType: 'video' });
    expect(result.success).toBe(false);
  });

  it('accepts all valid inputType values', () => {
    for (const inputType of [
      'conversation',
      'document',
      'url',
      'raw_text',
      'image',
      'audio',
      'code',
    ] as const) {
      const result = ExtractionSchema.safeParse({ ...baseExtraction, inputType });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all valid tierUsed values including multi_tier', () => {
    for (const tierUsed of ['heuristic', 'cheap_llm', 'smart_llm', 'multi_tier'] as const) {
      const result = ExtractionSchema.safeParse({ ...baseExtraction, tierUsed });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid tierUsed', () => {
    const result = ExtractionSchema.safeParse({ ...baseExtraction, tierUsed: 'unknown_tier' });
    expect(result.success).toBe(false);
  });

  it('accepts nullable tierUsed', () => {
    const result = ExtractionSchema.safeParse({ ...baseExtraction, tierUsed: null });
    expect(result.success).toBe(true);
  });

  it('rejects missing tenantId', () => {
    const { tenantId: _t, ...rest } = baseExtraction;
    const result = ExtractionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('accepts nullable fields', () => {
    const result = ExtractionSchema.safeParse({
      ...baseExtraction,
      inputData: null,
      sessionId: null,
      completedAt: null,
      error: null,
      durationMs: null,
    });
    expect(result.success).toBe(true);
  });

  it('coerces string dates', () => {
    const result = ExtractionSchema.safeParse({
      ...baseExtraction,
      createdAt: '2024-01-01T00:00:00.000Z',
      completedAt: '2024-01-02T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.completedAt).toBeInstanceOf(Date);
    }
  });

  it('accepts valid scope values', () => {
    for (const scope of ['user', 'agent', 'session', 'hive'] as const) {
      const result = ExtractionSchema.safeParse({ ...baseExtraction, scope });
      expect(result.success).toBe(true);
    }
  });
});

describe('CreateExtractionSchema', () => {
  const baseCreate = {
    tenantId: validUuid,
    inputType: 'raw_text' as const,
    inputData: 'Some text content.',
    inputHash: 'hash123',
    scope: 'user' as const,
    scopeId: validUuid,
  };

  it('accepts minimal valid input', () => {
    const result = CreateExtractionSchema.safeParse(baseCreate);
    expect(result.success).toBe(true);
  });

  it('rejects missing inputHash', () => {
    const { inputHash: _h, ...rest } = baseCreate;
    const result = CreateExtractionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects missing scope', () => {
    const { scope: _s, ...rest } = baseCreate;
    const result = CreateExtractionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('inputSize and sessionId are optional', () => {
    const result = CreateExtractionSchema.safeParse(baseCreate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.inputSize).toBeUndefined();
      expect(result.data.sessionId).toBeUndefined();
    }
  });
});

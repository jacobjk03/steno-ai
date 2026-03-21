import { describe, it, expect } from 'vitest';
import { SessionSchema, CreateSessionSchema } from '../../src/models/session.js';

const validUuid = '00000000-0000-0000-0000-000000000001';

const baseSession = {
  id: validUuid,
  tenantId: validUuid,
  scope: 'user' as const,
  scopeId: validUuid,
  startedAt: new Date('2024-01-01'),
  endedAt: null,
  summary: null,
  topics: [],
  messageCount: 0,
  factCount: 0,
  metadata: {},
  createdAt: new Date('2024-01-01'),
};

describe('SessionSchema', () => {
  it('accepts a valid session row', () => {
    expect(() => SessionSchema.parse(baseSession)).not.toThrow();
  });

  it('rejects invalid scope enum', () => {
    const result = SessionSchema.safeParse({ ...baseSession, scope: 'session' });
    expect(result.success).toBe(false);
  });

  it('accepts all valid SESSION_SCOPES values', () => {
    for (const scope of ['user', 'agent', 'hive'] as const) {
      const result = SessionSchema.safeParse({ ...baseSession, scope });
      expect(result.success).toBe(true);
    }
  });

  it('rejects missing tenantId', () => {
    const { tenantId: _t, ...rest } = baseSession;
    const result = SessionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('accepts nullable endedAt and summary', () => {
    const result = SessionSchema.safeParse({ ...baseSession, endedAt: null, summary: null });
    expect(result.success).toBe(true);
  });

  it('accepts topics as array of strings', () => {
    const result = SessionSchema.safeParse({ ...baseSession, topics: ['work', 'personal'] });
    expect(result.success).toBe(true);
  });

  it('coerces string dates', () => {
    const result = SessionSchema.safeParse({
      ...baseSession,
      startedAt: '2024-01-01T00:00:00.000Z',
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startedAt).toBeInstanceOf(Date);
    }
  });

  it('accepts metadata as record', () => {
    const result = SessionSchema.safeParse({ ...baseSession, metadata: { source: 'api' } });
    expect(result.success).toBe(true);
  });
});

describe('CreateSessionSchema', () => {
  const baseCreate = {
    tenantId: validUuid,
    scope: 'agent' as const,
    scopeId: validUuid,
  };

  it('applies default empty metadata', () => {
    const result = CreateSessionSchema.safeParse(baseCreate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metadata).toEqual({});
    }
  });

  it('rejects missing tenantId', () => {
    const { tenantId: _t, ...rest } = baseCreate;
    const result = CreateSessionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects missing scope', () => {
    const { scope: _s, ...rest } = baseCreate;
    const result = CreateSessionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects session scope value for scope', () => {
    const result = CreateSessionSchema.safeParse({ ...baseCreate, scope: 'session' });
    expect(result.success).toBe(false);
  });

  it('accepts custom metadata', () => {
    const result = CreateSessionSchema.safeParse({ ...baseCreate, metadata: { channel: 'slack' } });
    expect(result.success).toBe(true);
  });
});

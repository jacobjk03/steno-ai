import { describe, it, expect } from 'vitest';
import { ApiKeySchema, CreateApiKeySchema } from '../../src/models/api-key.js';

const validUuid = '00000000-0000-0000-0000-000000000001';

const baseApiKey = {
  id: validUuid,
  tenantId: validUuid,
  keyHash: 'sha256hashvalue',
  keyPrefix: 'sk-abc',
  name: 'Production Key',
  scopes: ['read', 'write'] as const,
  expiresAt: null,
  lastUsedAt: null,
  active: true,
  createdAt: new Date('2024-01-01'),
};

describe('ApiKeySchema', () => {
  it('accepts a valid api key row', () => {
    expect(() => ApiKeySchema.parse(baseApiKey)).not.toThrow();
  });

  it('rejects invalid scope enum in scopes array', () => {
    const result = ApiKeySchema.safeParse({ ...baseApiKey, scopes: ['superuser'] });
    expect(result.success).toBe(false);
  });

  it('accepts all valid scope values', () => {
    for (const scope of ['read', 'write', 'admin'] as const) {
      const result = ApiKeySchema.safeParse({ ...baseApiKey, scopes: [scope] });
      expect(result.success).toBe(true);
    }
  });

  it('accepts multiple scopes', () => {
    const result = ApiKeySchema.safeParse({ ...baseApiKey, scopes: ['read', 'write', 'admin'] });
    expect(result.success).toBe(true);
  });

  it('rejects name exceeding 100 chars', () => {
    const result = ApiKeySchema.safeParse({ ...baseApiKey, name: 'x'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('accepts name at exactly 100 chars', () => {
    const result = ApiKeySchema.safeParse({ ...baseApiKey, name: 'x'.repeat(100) });
    expect(result.success).toBe(true);
  });

  it('accepts nullable expiresAt and lastUsedAt', () => {
    const result = ApiKeySchema.safeParse({ ...baseApiKey, expiresAt: null, lastUsedAt: null });
    expect(result.success).toBe(true);
  });

  it('rejects missing tenantId', () => {
    const { tenantId: _t, ...rest } = baseApiKey;
    const result = ApiKeySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects missing keyHash', () => {
    const { keyHash: _h, ...rest } = baseApiKey;
    const result = ApiKeySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('coerces string dates', () => {
    const result = ApiKeySchema.safeParse({
      ...baseApiKey,
      expiresAt: '2025-01-01T00:00:00.000Z',
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.expiresAt).toBeInstanceOf(Date);
      expect(result.data.createdAt).toBeInstanceOf(Date);
    }
  });
});

describe('CreateApiKeySchema', () => {
  const baseCreate = {
    tenantId: validUuid,
  };

  it('applies defaults for name and scopes', () => {
    const result = CreateApiKeySchema.safeParse(baseCreate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Default');
      expect(result.data.scopes).toEqual(['read', 'write']);
    }
  });

  it('rejects missing tenantId', () => {
    const result = CreateApiKeySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects invalid tenantId uuid', () => {
    const result = CreateApiKeySchema.safeParse({ tenantId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('expiresAt is optional', () => {
    const result = CreateApiKeySchema.safeParse(baseCreate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.expiresAt).toBeUndefined();
    }
  });

  it('accepts custom name and scopes', () => {
    const result = CreateApiKeySchema.safeParse({
      tenantId: validUuid,
      name: 'My Key',
      scopes: ['admin'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('My Key');
      expect(result.data.scopes).toEqual(['admin']);
    }
  });

  it('accepts expiresAt as a date string', () => {
    const result = CreateApiKeySchema.safeParse({
      tenantId: validUuid,
      expiresAt: '2026-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.expiresAt).toBeInstanceOf(Date);
    }
  });
});

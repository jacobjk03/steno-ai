import { describe, it, expect } from 'vitest';
import { TenantSchema, CreateTenantSchema } from '../../src/models/tenant.js';

const validUuid = '00000000-0000-0000-0000-000000000001';

const defaultConfig = {
  embeddingModel: 'text-embedding-3-small',
  embeddingDim: 1536,
  decayHalfLifeDays: 30,
  decayNormalizationK: 50,
  maxFactsPerScope: 10000,
  retrievalWeights: {
    vector: 0.35,
    keyword: 0.15,
    graph: 0.2,
    recency: 0.15,
    salience: 0.15,
  },
};

const baseTenant = {
  id: validUuid,
  name: 'Acme Corp',
  slug: 'acme-corp',
  config: defaultConfig,
  plan: 'free' as const,
  tokenLimitMonthly: BigInt(1000000),
  queryLimitMonthly: BigInt(10000),
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  active: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

describe('TenantSchema', () => {
  it('accepts a valid tenant row', () => {
    expect(() => TenantSchema.parse(baseTenant)).not.toThrow();
  });

  it('rejects invalid plan enum', () => {
    const result = TenantSchema.safeParse({ ...baseTenant, plan: 'basic' });
    expect(result.success).toBe(false);
  });

  it('accepts all valid plan values', () => {
    for (const plan of ['free', 'pro', 'scale', 'enterprise'] as const) {
      const result = TenantSchema.safeParse({ ...baseTenant, plan });
      expect(result.success).toBe(true);
    }
  });

  it('rejects slug with invalid characters', () => {
    const result = TenantSchema.safeParse({ ...baseTenant, slug: 'Acme Corp' });
    expect(result.success).toBe(false);
  });

  it('rejects slug with uppercase letters', () => {
    const result = TenantSchema.safeParse({ ...baseTenant, slug: 'ACME' });
    expect(result.success).toBe(false);
  });

  it('accepts valid slug with lowercase, digits, and hyphens', () => {
    const result = TenantSchema.safeParse({ ...baseTenant, slug: 'my-tenant-123' });
    expect(result.success).toBe(true);
  });

  it('rejects name exceeding 100 chars', () => {
    const result = TenantSchema.safeParse({ ...baseTenant, name: 'x'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('accepts name at exactly 100 chars', () => {
    const result = TenantSchema.safeParse({ ...baseTenant, name: 'x'.repeat(100) });
    expect(result.success).toBe(true);
  });

  it('rejects slug exceeding 50 chars', () => {
    const result = TenantSchema.safeParse({ ...baseTenant, slug: 'a'.repeat(51) });
    expect(result.success).toBe(false);
  });

  it('accepts nullable stripeCustomerId and stripeSubscriptionId', () => {
    const result = TenantSchema.safeParse({
      ...baseTenant,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing tenantId (id)', () => {
    const { id: _i, ...rest } = baseTenant;
    const result = TenantSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('coerces string dates', () => {
    const result = TenantSchema.safeParse({
      ...baseTenant,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.createdAt).toBeInstanceOf(Date);
    }
  });
});

describe('CreateTenantSchema', () => {
  const baseCreate = {
    name: 'Test Corp',
    slug: 'test-corp',
  };

  it('applies default plan as free and default config', () => {
    const result = CreateTenantSchema.safeParse(baseCreate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.plan).toBe('free');
      expect(result.data.config.embeddingModel).toBe('text-embedding-3-small');
      expect(result.data.config.embeddingDim).toBe(1536);
    }
  });

  it('rejects missing name', () => {
    const { name: _n, ...rest } = baseCreate;
    const result = CreateTenantSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects missing slug', () => {
    const { slug: _s, ...rest } = baseCreate;
    const result = CreateTenantSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects invalid slug format', () => {
    const result = CreateTenantSchema.safeParse({ ...baseCreate, slug: 'Test Corp!' });
    expect(result.success).toBe(false);
  });

  it('accepts custom plan', () => {
    const result = CreateTenantSchema.safeParse({ ...baseCreate, plan: 'enterprise' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.plan).toBe('enterprise');
    }
  });
});

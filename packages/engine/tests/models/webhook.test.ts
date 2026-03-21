import { describe, it, expect } from 'vitest';
import { WebhookSchema, CreateWebhookSchema, WEBHOOK_EVENTS } from '../../src/models/webhook.js';

const validUuid = '00000000-0000-0000-0000-000000000001';

const baseWebhook = {
  id: validUuid,
  tenantId: validUuid,
  url: 'https://example.com/webhook',
  events: ['extraction.completed'] as const,
  secretHash: 'sha256hashvalue',
  active: true,
  createdAt: new Date('2024-01-01'),
};

describe('WebhookSchema', () => {
  it('accepts a valid webhook row', () => {
    expect(() => WebhookSchema.parse(baseWebhook)).not.toThrow();
  });

  it('rejects invalid URL', () => {
    const result = WebhookSchema.safeParse({ ...baseWebhook, url: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid event enum', () => {
    const result = WebhookSchema.safeParse({ ...baseWebhook, events: ['invalid.event'] });
    expect(result.success).toBe(false);
  });

  it('accepts all valid event values', () => {
    for (const event of WEBHOOK_EVENTS) {
      const result = WebhookSchema.safeParse({ ...baseWebhook, events: [event] });
      expect(result.success).toBe(true);
    }
  });

  it('accepts multiple events', () => {
    const result = WebhookSchema.safeParse({
      ...baseWebhook,
      events: ['extraction.completed', 'extraction.failed', 'trigger.fired'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing tenantId', () => {
    const { tenantId: _t, ...rest } = baseWebhook;
    const result = WebhookSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects missing url', () => {
    const { url: _u, ...rest } = baseWebhook;
    const result = WebhookSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects missing secretHash', () => {
    const { secretHash: _s, ...rest } = baseWebhook;
    const result = WebhookSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('defaults active to true', () => {
    const { active: _a, ...rest } = baseWebhook;
    const result = WebhookSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.active).toBe(true);
    }
  });

  it('coerces string dates', () => {
    const result = WebhookSchema.safeParse({
      ...baseWebhook,
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.createdAt).toBeInstanceOf(Date);
    }
  });
});

describe('CreateWebhookSchema', () => {
  const baseCreate = {
    tenantId: validUuid,
    url: 'https://example.com/webhook',
    events: ['extraction.completed'] as const,
    secret: 'a-secret-at-least-16',
  };

  it('accepts valid create input', () => {
    const result = CreateWebhookSchema.safeParse(baseCreate);
    expect(result.success).toBe(true);
  });

  it('rejects missing tenantId', () => {
    const { tenantId: _t, ...rest } = baseCreate;
    const result = CreateWebhookSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects invalid tenantId uuid', () => {
    const result = CreateWebhookSchema.safeParse({ ...baseCreate, tenantId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid URL', () => {
    const result = CreateWebhookSchema.safeParse({ ...baseCreate, url: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('rejects empty events array', () => {
    const result = CreateWebhookSchema.safeParse({ ...baseCreate, events: [] });
    expect(result.success).toBe(false);
  });

  it('rejects invalid event in events array', () => {
    const result = CreateWebhookSchema.safeParse({ ...baseCreate, events: ['bad.event'] });
    expect(result.success).toBe(false);
  });

  it('rejects secret shorter than 16 characters', () => {
    const result = CreateWebhookSchema.safeParse({ ...baseCreate, secret: 'short' });
    expect(result.success).toBe(false);
  });

  it('accepts secret at exactly 16 characters', () => {
    const result = CreateWebhookSchema.safeParse({ ...baseCreate, secret: 'a'.repeat(16) });
    expect(result.success).toBe(true);
  });

  it('rejects missing secret', () => {
    const { secret: _s, ...rest } = baseCreate;
    const result = CreateWebhookSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('accepts multiple valid events', () => {
    const result = CreateWebhookSchema.safeParse({
      ...baseCreate,
      events: ['extraction.completed', 'trigger.fired', 'usage.limit_exceeded'],
    });
    expect(result.success).toBe(true);
  });
});

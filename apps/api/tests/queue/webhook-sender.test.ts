import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleWebhookQueue } from '../../src/queue/webhook-sender.js';
import type { WebhookMessage } from '../../src/queue/webhook-sender.js';
import type { Env } from '../../src/env.js';

// ---------------------------------------------------------------------------
// Mock signWebhookPayload
// ---------------------------------------------------------------------------

const mockSignWebhookPayload = vi.fn().mockResolvedValue('mock-signature-hex');
vi.mock('../../src/lib/webhook.js', () => ({
  signWebhookPayload: (...args: unknown[]) => mockSignWebhookPayload(...args),
}));

// ---------------------------------------------------------------------------
// Mock adapters — mockGetWebhooksByEvent is the key stub
// ---------------------------------------------------------------------------

const mockGetWebhooksByEvent = vi.fn();
const mockStorage = { getWebhooksByEvent: mockGetWebhooksByEvent };

vi.mock('../../src/lib/adapters.js', () => ({
  createAdapters: () => ({
    storage: mockStorage,
    embedding: { fake: 'embedding' },
    cheapLLM: { fake: 'cheapLLM' },
    smartLLM: { fake: 'smartLLM' },
    cache: { fake: 'cache' },
  }),
}));

// ---------------------------------------------------------------------------
// Mock global fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    OPENAI_API_KEY: 'test-openai-key',
    UPSTASH_REDIS_REST_URL: 'https://test.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'test-redis-token',
    EXTRACTION_QUEUE: {} as Queue,
    WEBHOOK_QUEUE: {} as Queue,
    ...overrides,
  } as Env;
}

function makeMessage(
  body: WebhookMessage,
  overrides: Partial<Message<WebhookMessage>> = {},
): Message<WebhookMessage> {
  return {
    body,
    id: 'msg-1',
    timestamp: new Date(),
    attempts: 1,
    ack: vi.fn(),
    retry: vi.fn(),
    ...overrides,
  } as unknown as Message<WebhookMessage>;
}

function makeBatch(
  messages: Message<WebhookMessage>[],
): MessageBatch<WebhookMessage> {
  return {
    messages,
    queue: 'steno-webhooks',
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  } as unknown as MessageBatch<WebhookMessage>;
}

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const WEBHOOK_ID_1 = '00000000-0000-0000-0000-0000000000a1';
const WEBHOOK_ID_2 = '00000000-0000-0000-0000-0000000000a2';

function makeWebhook(id: string, url: string) {
  return {
    id,
    tenantId: TENANT_ID,
    url,
    events: ['extraction.completed'] as string[],
    secretHash: 'hashed-secret',
    signingKey: `signing-key-for-${id}`,
    active: true,
    createdAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleWebhookQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
  });

  it('fetches webhooks by event and delivers to each URL', async () => {
    const wh1 = makeWebhook(WEBHOOK_ID_1, 'https://example.com/hook1');
    const wh2 = makeWebhook(WEBHOOK_ID_2, 'https://example.com/hook2');
    mockGetWebhooksByEvent.mockResolvedValue([wh1, wh2]);

    const msg = makeMessage({
      tenantId: TENANT_ID,
      event: 'extraction.completed',
      payload: { extraction_id: 'ext-1' },
    });
    const batch = makeBatch([msg]);
    const env = makeEnv();

    await handleWebhookQueue(batch, env);

    // Should look up webhooks for the event
    expect(mockGetWebhooksByEvent).toHaveBeenCalledWith(TENANT_ID, 'extraction.completed');

    // Should deliver to both webhook URLs
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toBe('https://example.com/hook1');
    expect(mockFetch.mock.calls[1][0]).toBe('https://example.com/hook2');

    // Should ack
    expect(msg.ack).toHaveBeenCalledTimes(1);
  });

  it('acks immediately when no webhooks are registered', async () => {
    mockGetWebhooksByEvent.mockResolvedValue([]);

    const msg = makeMessage({
      tenantId: TENANT_ID,
      event: 'extraction.completed',
      payload: { extraction_id: 'ext-1' },
    });
    const batch = makeBatch([msg]);
    const env = makeEnv();

    await handleWebhookQueue(batch, env);

    expect(mockGetWebhooksByEvent).toHaveBeenCalledWith(TENANT_ID, 'extraction.completed');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalledTimes(1);
  });

  it('sets correct headers (Content-Type, X-Steno-Signature, X-Steno-Event)', async () => {
    const wh = makeWebhook(WEBHOOK_ID_1, 'https://example.com/hook');
    mockGetWebhooksByEvent.mockResolvedValue([wh]);

    const msg = makeMessage({
      tenantId: TENANT_ID,
      event: 'extraction.completed',
      payload: { extraction_id: 'ext-1' },
    });
    const batch = makeBatch([msg]);
    const env = makeEnv();

    await handleWebhookQueue(batch, env);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, fetchOpts] = mockFetch.mock.calls[0];
    expect(fetchOpts.method).toBe('POST');
    expect(fetchOpts.headers['Content-Type']).toBe('application/json');
    expect(fetchOpts.headers['X-Steno-Signature']).toBe('mock-signature-hex');
    expect(fetchOpts.headers['X-Steno-Event']).toBe('extraction.completed');
  });

  it('payload includes event, data, and timestamp', async () => {
    const wh = makeWebhook(WEBHOOK_ID_1, 'https://example.com/hook');
    mockGetWebhooksByEvent.mockResolvedValue([wh]);

    const msg = makeMessage({
      tenantId: TENANT_ID,
      event: 'trigger.fired',
      payload: { trigger_id: 'tr-1', matched_fact: 'f-1' },
    });
    const batch = makeBatch([msg]);
    const env = makeEnv();

    await handleWebhookQueue(batch, env);

    const [, fetchOpts] = mockFetch.mock.calls[0];
    const body = JSON.parse(fetchOpts.body);
    expect(body.event).toBe('trigger.fired');
    expect(body.data).toEqual({ trigger_id: 'tr-1', matched_fact: 'f-1' });
    expect(body.timestamp).toBeDefined();
    // Verify timestamp is a valid ISO string
    expect(() => new Date(body.timestamp)).not.toThrow();
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it('signs payload with signWebhookPayload using webhook signingKey', async () => {
    const wh = makeWebhook(WEBHOOK_ID_1, 'https://example.com/hook');
    mockGetWebhooksByEvent.mockResolvedValue([wh]);

    const msg = makeMessage({
      tenantId: TENANT_ID,
      event: 'extraction.completed',
      payload: { extraction_id: 'ext-1' },
    });
    const batch = makeBatch([msg]);
    const env = makeEnv();

    await handleWebhookQueue(batch, env);

    expect(mockSignWebhookPayload).toHaveBeenCalledTimes(1);
    const [payloadStr, secret] = mockSignWebhookPayload.mock.calls[0];
    // Should use webhook signingKey (raw secret) for HMAC signing
    expect(secret).toBe(`signing-key-for-${WEBHOOK_ID_1}`);
    // Payload string should be valid JSON with event + data + timestamp
    const parsed = JSON.parse(payloadStr as string);
    expect(parsed.event).toBe('extraction.completed');
    expect(parsed.data).toEqual({ extraction_id: 'ext-1' });
  });

  it('individual fetch failure does not prevent other deliveries', async () => {
    const wh1 = makeWebhook(WEBHOOK_ID_1, 'https://example.com/hook1');
    const wh2 = makeWebhook(WEBHOOK_ID_2, 'https://example.com/hook2');
    mockGetWebhooksByEvent.mockResolvedValue([wh1, wh2]);

    // First fetch throws, second succeeds
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const msg = makeMessage({
      tenantId: TENANT_ID,
      event: 'extraction.completed',
      payload: { extraction_id: 'ext-1' },
    });
    const batch = makeBatch([msg]);
    const env = makeEnv();

    await handleWebhookQueue(batch, env);

    // Both webhooks should have been attempted
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // Message should still be acked (individual failures don't block)
    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(msg.retry).not.toHaveBeenCalled();
  });

  it('retries message when processing error occurs', async () => {
    // getWebhooksByEvent itself throws
    mockGetWebhooksByEvent.mockRejectedValue(new Error('DB unavailable'));

    const msg = makeMessage({
      tenantId: TENANT_ID,
      event: 'extraction.completed',
      payload: { extraction_id: 'ext-1' },
    });
    const batch = makeBatch([msg]);
    const env = makeEnv();

    await handleWebhookQueue(batch, env);

    expect(msg.ack).not.toHaveBeenCalled();
    expect(msg.retry).toHaveBeenCalledTimes(1);
  });

  it('empty batch results in no-op', async () => {
    const batch = makeBatch([]);
    const env = makeEnv();

    await handleWebhookQueue(batch, env);

    expect(mockGetWebhooksByEvent).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('handles non-ok HTTP response without throwing', async () => {
    const wh = makeWebhook(WEBHOOK_ID_1, 'https://example.com/hook');
    mockGetWebhooksByEvent.mockResolvedValue([wh]);
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const msg = makeMessage({
      tenantId: TENANT_ID,
      event: 'extraction.failed',
      payload: { extraction_id: 'ext-1', error: 'something broke' },
    });
    const batch = makeBatch([msg]);
    const env = makeEnv();

    await handleWebhookQueue(batch, env);

    // Should still ack -- non-ok HTTP is logged but doesn't cause retry
    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(msg.retry).not.toHaveBeenCalled();
  });
});

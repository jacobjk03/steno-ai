import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleExtractionQueue } from '../../src/queue/extraction-worker.js';
import type { ExtractionMessage } from '../../src/queue/extraction-worker.js';
import type { Env } from '../../src/env.js';

// ---------------------------------------------------------------------------
// Mock @steno-ai/engine
// ---------------------------------------------------------------------------

const mockRunExtractionFromQueue = vi.fn();
vi.mock('@steno-ai/engine', () => ({
  runExtractionFromQueue: (...args: unknown[]) => mockRunExtractionFromQueue(...args),
}));

// ---------------------------------------------------------------------------
// Mock adapters
// ---------------------------------------------------------------------------

const mockStorage = { fake: 'storage' };
const mockEmbedding = { fake: 'embedding' };
const mockCheapLLM = { fake: 'cheapLLM' };
const mockSmartLLM = { fake: 'smartLLM' };

vi.mock('../../src/lib/adapters.js', () => ({
  createAdapters: () => ({
    storage: mockStorage,
    embedding: mockEmbedding,
    cheapLLM: mockCheapLLM,
    smartLLM: mockSmartLLM,
    cache: { fake: 'cache' },
  }),
}));

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
  body: ExtractionMessage,
  overrides: Partial<Message<ExtractionMessage>> = {},
): Message<ExtractionMessage> {
  return {
    body,
    id: 'msg-1',
    timestamp: new Date(),
    attempts: 1,
    ack: vi.fn(),
    retry: vi.fn(),
    ...overrides,
  } as unknown as Message<ExtractionMessage>;
}

function makeBatch(
  messages: Message<ExtractionMessage>[],
): MessageBatch<ExtractionMessage> {
  return {
    messages,
    queue: 'steno-extraction',
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  } as unknown as MessageBatch<ExtractionMessage>;
}

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const EXTRACTION_ID = '00000000-0000-0000-0000-000000000099';

function makeMessageBody(
  overrides: Partial<ExtractionMessage> = {},
): ExtractionMessage {
  return {
    tenantId: TENANT_ID,
    extractionId: EXTRACTION_ID,
    scope: 'user',
    scopeId: 'user_1',
    inputType: 'raw_text',
    data: 'Test text for extraction',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleExtractionQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunExtractionFromQueue.mockResolvedValue({
      extractionId: EXTRACTION_ID,
      factsCreated: 1,
      factsUpdated: 0,
      factsInvalidated: 0,
      entitiesCreated: 0,
      edgesCreated: 0,
      tier: 'cheap_llm',
      costTokensInput: 50,
      costTokensOutput: 30,
      durationMs: 100,
    });
  });

  it('processes a message successfully and acks it', async () => {
    const msg = makeMessage(makeMessageBody());
    const batch = makeBatch([msg]);
    const env = makeEnv();

    await handleExtractionQueue(batch, env);

    // Should call runExtractionFromQueue with correct arguments
    expect(mockRunExtractionFromQueue).toHaveBeenCalledTimes(1);
    const [config, extractionId, input] = mockRunExtractionFromQueue.mock.calls[0];
    expect(extractionId).toBe(EXTRACTION_ID);
    expect(input.tenantId).toBe(TENANT_ID);
    expect(input.scope).toBe('user');
    expect(input.scopeId).toBe('user_1');
    expect(input.inputType).toBe('raw_text');
    expect(input.data).toBe('Test text for extraction');

    // Should ack the message
    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(msg.retry).not.toHaveBeenCalled();
  });

  it('retries message on extraction failure', async () => {
    mockRunExtractionFromQueue.mockRejectedValue(new Error('LLM unavailable'));

    const msg = makeMessage(makeMessageBody());
    const batch = makeBatch([msg]);
    const env = makeEnv();

    await handleExtractionQueue(batch, env);

    // Should NOT ack, should retry
    expect(msg.ack).not.toHaveBeenCalled();
    expect(msg.retry).toHaveBeenCalledTimes(1);
  });

  it('creates adapters from env and passes them in config', async () => {
    const msg = makeMessage(makeMessageBody());
    const batch = makeBatch([msg]);
    const env = makeEnv();

    await handleExtractionQueue(batch, env);

    const [config] = mockRunExtractionFromQueue.mock.calls[0];
    expect(config.storage).toBe(mockStorage);
    expect(config.embedding).toBe(mockEmbedding);
    expect(config.cheapLLM).toBe(mockCheapLLM);
    expect(config.smartLLM).toBe(mockSmartLLM);
  });

  it('uses default embedding model and dim from env', async () => {
    const msg = makeMessage(makeMessageBody());
    const batch = makeBatch([msg]);
    const env = makeEnv();

    await handleExtractionQueue(batch, env);

    const [config] = mockRunExtractionFromQueue.mock.calls[0];
    expect(config.embeddingModel).toBe('text-embedding-3-small');
    expect(config.embeddingDim).toBe(1536);
  });

  it('uses custom embedding model and dim from env when provided', async () => {
    const msg = makeMessage(makeMessageBody());
    const batch = makeBatch([msg]);
    const env = makeEnv({
      EMBEDDING_MODEL: 'text-embedding-3-large',
      EMBEDDING_DIM: '3072',
    });

    await handleExtractionQueue(batch, env);

    const [config] = mockRunExtractionFromQueue.mock.calls[0];
    expect(config.embeddingModel).toBe('text-embedding-3-large');
    expect(config.embeddingDim).toBe(3072);
  });

  it('processes multiple messages in a batch', async () => {
    const msg1 = makeMessage(makeMessageBody({ extractionId: 'ext-1' }));
    const msg2 = makeMessage(makeMessageBody({ extractionId: 'ext-2' }));
    const batch = makeBatch([msg1, msg2]);
    const env = makeEnv();

    await handleExtractionQueue(batch, env);

    expect(mockRunExtractionFromQueue).toHaveBeenCalledTimes(2);
    expect(msg1.ack).toHaveBeenCalledTimes(1);
    expect(msg2.ack).toHaveBeenCalledTimes(1);
  });

  it('one failure does not prevent other messages from processing', async () => {
    mockRunExtractionFromQueue
      .mockRejectedValueOnce(new Error('first fails'))
      .mockResolvedValueOnce({ extractionId: 'ext-2' });

    const msg1 = makeMessage(makeMessageBody({ extractionId: 'ext-1' }));
    const msg2 = makeMessage(makeMessageBody({ extractionId: 'ext-2' }));
    const batch = makeBatch([msg1, msg2]);
    const env = makeEnv();

    await handleExtractionQueue(batch, env);

    // First message should retry, second should ack
    expect(msg1.retry).toHaveBeenCalledTimes(1);
    expect(msg1.ack).not.toHaveBeenCalled();
    expect(msg2.ack).toHaveBeenCalledTimes(1);
    expect(msg2.retry).not.toHaveBeenCalled();
  });

  it('passes sessionId when provided in message', async () => {
    const sessionId = '00000000-0000-0000-0000-000000000055';
    const msg = makeMessage(makeMessageBody({ sessionId }));
    const batch = makeBatch([msg]);
    const env = makeEnv();

    await handleExtractionQueue(batch, env);

    const [, , input] = mockRunExtractionFromQueue.mock.calls[0];
    expect(input.sessionId).toBe(sessionId);
  });
});

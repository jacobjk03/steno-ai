import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Steno, { StenoError } from '../src/index.js';

// ── Fetch mock helper ──

function mockFetch(
  status: number,
  body: unknown,
  headers?: Record<string, string>,
) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 429 ? 'Too Many Requests' : 'OK',
    headers: new Headers(headers ?? {}),
    json: () => Promise.resolve(body),
  } as Response);
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

// ── Constructor ──

describe('constructor', () => {
  it('throws if no API key', () => {
    expect(() => new Steno('')).toThrow('Steno API key is required');
  });

  it('defaults baseUrl to https://api.steno.ai', () => {
    const fetchMock = mockFetch(200, { data: { extraction_id: 'e1' } });
    globalThis.fetch = fetchMock;
    const steno = new Steno('sk_test');
    steno.add('u1', 'hi');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://api.steno.ai'),
      expect.anything(),
    );
  });

  it('uses custom baseUrl', () => {
    const fetchMock = mockFetch(200, { data: { extraction_id: 'e1' } });
    globalThis.fetch = fetchMock;
    const steno = new Steno('sk_test', { baseUrl: 'http://localhost:7540' });
    steno.add('u1', 'hi');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('http://localhost:7540'),
      expect.anything(),
    );
  });
});

// ── steno.add() ──

describe('steno.add()', () => {
  it('sends POST /v1/memory with raw_text for string content', async () => {
    const fetchMock = mockFetch(200, { data: { extraction_id: 'ext_abc' } });
    globalThis.fetch = fetchMock;
    const steno = new Steno('sk_test');

    const result = await steno.add('user_123', 'I love pizza');

    expect(result).toEqual({ extractionId: 'ext_abc' });
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.steno.ai/v1/memory');
    expect(opts.method).toBe('POST');
    expect(opts.headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer sk_test' }),
    );

    const body = JSON.parse(opts.body as string);
    expect(body).toEqual({
      scope: 'user',
      scope_id: 'user_123',
      input_type: 'raw_text',
      data: 'I love pizza',
    });
  });

  it('sends conversation format for array content', async () => {
    const fetchMock = mockFetch(200, { data: { extraction_id: 'ext_def' } });
    globalThis.fetch = fetchMock;
    const steno = new Steno('sk_test');

    const messages = [
      { role: 'user', content: 'I love pizza' },
      { role: 'assistant', content: 'Got it!' },
    ];
    const result = await steno.add('user_123', messages);

    expect(result).toEqual({ extractionId: 'ext_def' });

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body).toEqual({
      scope: 'user',
      scope_id: 'user_123',
      input_type: 'conversation',
      messages: [
        { role: 'user', content: 'I love pizza' },
        { role: 'assistant', content: 'Got it!' },
      ],
    });
  });
});

// ── steno.search() ──

describe('steno.search()', () => {
  it('sends POST /v1/memory/search and returns camelCase results', async () => {
    const fetchMock = mockFetch(200, {
      data: {
        results: [
          {
            id: 'f1',
            content: 'User loves pizza',
            score: 0.92,
            scope: 'user',
            scope_id: 'user_123',
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        ],
        query: 'food preferences',
      },
    });
    globalThis.fetch = fetchMock;
    const steno = new Steno('sk_test');

    const response = await steno.search('user_123', 'food preferences');

    expect(response.results).toHaveLength(1);
    expect(response.results[0]).toEqual({
      id: 'f1',
      content: 'User loves pizza',
      score: 0.92,
      scope: 'user',
      scopeId: 'user_123',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    });

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.steno.ai/v1/memory/search');

    const body = JSON.parse(opts.body as string);
    expect(body).toEqual({
      query: 'food preferences',
      scope: 'user',
      scope_id: 'user_123',
    });
  });

  it('passes limit when provided', async () => {
    const fetchMock = mockFetch(200, { data: { results: [], query: 'q' } });
    globalThis.fetch = fetchMock;
    const steno = new Steno('sk_test');

    await steno.search('user_123', 'q', 5);

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.limit).toBe(5);
  });
});

// ── steno.feedback() ──

describe('steno.feedback()', () => {
  it('sends POST /v1/feedback with positive feedback', async () => {
    const fetchMock = mockFetch(204, null);
    globalThis.fetch = fetchMock;
    const steno = new Steno('sk_test');

    await steno.feedback('fact_abc', true);

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.steno.ai/v1/feedback');
    expect(opts.method).toBe('POST');

    const body = JSON.parse(opts.body as string);
    expect(body).toEqual({
      fact_id: 'fact_abc',
      was_useful: true,
      feedback_type: 'explicit_positive',
    });
  });

  it('sends negative feedback', async () => {
    const fetchMock = mockFetch(204, null);
    globalThis.fetch = fetchMock;
    const steno = new Steno('sk_test');

    await steno.feedback('fact_abc', false);

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.feedback_type).toBe('explicit_negative');
    expect(body.was_useful).toBe(false);
  });
});

// ── Error handling ──

describe('error handling', () => {
  it('throws StenoError with code and status', async () => {
    const fetchMock = mockFetch(403, {
      error: { code: 'invalid_key', message: 'API key is invalid' },
    });
    globalThis.fetch = fetchMock;
    const steno = new Steno('sk_test');

    await expect(steno.search('u1', 'q')).rejects.toThrow(StenoError);

    try {
      await steno.search('u1', 'q');
    } catch (e) {
      const err = e as StenoError;
      expect(err.code).toBe('invalid_key');
      expect(err.message).toBe('API key is invalid');
      expect(err.status).toBe(403);
    }
  });

  it('handles non-JSON error response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Headers(),
      json: () => Promise.reject(new Error('not json')),
    } as unknown as Response);
    const steno = new Steno('sk_test');

    await expect(steno.add('u1', 'hi')).rejects.toThrow(StenoError);

    try {
      await steno.add('u1', 'hi');
    } catch (e) {
      const err = e as StenoError;
      expect(err.code).toBe('unknown');
      expect(err.message).toBe('Internal Server Error');
      expect(err.status).toBe(500);
    }
  });
});

// ── Rate limit retry ──

describe('rate limiting', () => {
  it('retries once on 429 with retry-after header', async () => {
    const rateLimitResponse = {
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: new Headers({ 'retry-after': '0' }), // 0 seconds for fast test
      json: () => Promise.resolve({ error: { message: 'rate limited' } }),
    } as unknown as Response;

    const successResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: () =>
        Promise.resolve({ data: { extraction_id: 'ext_retry' } }),
    } as unknown as Response;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rateLimitResponse)
      .mockResolvedValueOnce(successResponse);
    globalThis.fetch = fetchMock;

    const steno = new Steno('sk_test');
    const result = await steno.add('u1', 'retry test');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ extractionId: 'ext_retry' });
  });
});

// ── Snake/camel case conversion ──

describe('case conversion', () => {
  it('converts camelCase request body to snake_case', async () => {
    const fetchMock = mockFetch(200, { data: {} });
    globalThis.fetch = fetchMock;
    const steno = new Steno('sk_test');

    await steno.memory.search({
      query: 'test',
      scope: 'user',
      scopeId: 'u1',
      includeGraph: true,
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body).toHaveProperty('scope_id', 'u1');
    expect(body).toHaveProperty('include_graph', true);
    expect(body).not.toHaveProperty('scopeId');
    expect(body).not.toHaveProperty('includeGraph');
  });

  it('converts snake_case response to camelCase', async () => {
    const fetchMock = mockFetch(200, {
      data: {
        extraction_id: 'e1',
        created_at: '2025-01-01',
        nested_obj: { inner_key: 'val' },
      },
    });
    globalThis.fetch = fetchMock;
    const steno = new Steno('sk_test');

    const result = await steno.add('u1', 'test');

    expect(result).toEqual({
      extractionId: 'e1',
      createdAt: '2025-01-01',
      nestedObj: { innerKey: 'val' },
    });
  });
});

// ── Full API (power user) ──

describe('full API', () => {
  it('memory.get sends GET /v1/memory/:id', async () => {
    const fetchMock = mockFetch(200, {
      data: { id: 'f1', content: 'test fact' },
    });
    globalThis.fetch = fetchMock;
    const steno = new Steno('sk_test');

    const fact = await steno.memory.get('f1');

    expect(fact).toEqual({ id: 'f1', content: 'test fact' });
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.steno.ai/v1/memory/f1');
    expect(opts.method).toBe('GET');
  });

  it('memory.delete sends DELETE /v1/memory/:id', async () => {
    const fetchMock = mockFetch(204, null);
    globalThis.fetch = fetchMock;
    const steno = new Steno('sk_test');

    await steno.memory.delete('f1');

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.steno.ai/v1/memory/f1');
    expect(opts.method).toBe('DELETE');
  });

  it('sessions.start sends POST /v1/sessions', async () => {
    const fetchMock = mockFetch(200, {
      data: { id: 's1', scope: 'user', scope_id: 'u1', started_at: 'now' },
    });
    globalThis.fetch = fetchMock;
    const steno = new Steno('sk_test');

    const session = await steno.sessions.start('user', 'u1');

    expect(session).toEqual({
      id: 's1',
      scope: 'user',
      scopeId: 'u1',
      startedAt: 'now',
    });
  });

  it('usage() sends GET /v1/usage', async () => {
    const fetchMock = mockFetch(200, {
      data: {
        memories_stored: 42,
        searches_this_month: 100,
        extractions_this_month: 50,
      },
    });
    globalThis.fetch = fetchMock;
    const steno = new Steno('sk_test');

    const usage = await steno.usage();

    expect(usage).toEqual({
      memoriesStored: 42,
      searchesThisMonth: 100,
      extractionsThisMonth: 50,
    });
  });
});

// ── steno.profile() ──

describe('steno.profile()', () => {
  it('sends GET /v1/profile with scope params', async () => {
    const fetchMock = mockFetch(200, {
      data: {
        user_id: 'u1',
        facts_count: 10,
        first_seen: '2025-01-01',
        last_seen: '2025-06-01',
        top_topics: ['food', 'work'],
      },
    });
    globalThis.fetch = fetchMock;
    const steno = new Steno('sk_test');

    const profile = await steno.profile('u1');

    expect(profile).toEqual({
      userId: 'u1',
      factsCount: 10,
      firstSeen: '2025-01-01',
      lastSeen: '2025-06-01',
      topTopics: ['food', 'work'],
    });

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.steno.ai/v1/profile?scope=user&scope_id=u1');
    expect(opts.method).toBe('GET');
  });
});

// ── steno.update() ──

describe('steno.update()', () => {
  it('sends PATCH /v1/memory/:id with content', async () => {
    const fetchMock = mockFetch(200, { data: { id: 'f1', content: 'updated' } });
    globalThis.fetch = fetchMock;
    const steno = new Steno('sk_test');

    await steno.update('f1', 'updated content');

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.steno.ai/v1/memory/f1');
    expect(opts.method).toBe('PATCH');

    const body = JSON.parse(opts.body as string);
    expect(body).toEqual({ content: 'updated content' });
  });
});

// ── memory.list() ──

describe('memory.list()', () => {
  it('sends GET /v1/memory with query params', async () => {
    const fetchMock = mockFetch(200, { data: { items: [], cursor: null } });
    globalThis.fetch = fetchMock;
    const steno = new Steno('sk_test');

    await steno.memory.list({ scope: 'user', scopeId: 'u1', limit: 10 });

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/memory?');
    expect(url).toContain('scope=user');
    expect(url).toContain('scope_id=u1');
    expect(url).toContain('limit=10');
    expect(opts.method).toBe('GET');
  });

  it('includes cursor when provided', async () => {
    const fetchMock = mockFetch(200, { data: { items: [], cursor: null } });
    globalThis.fetch = fetchMock;
    const steno = new Steno('sk_test');

    await steno.memory.list({ scope: 'user', scopeId: 'u1', cursor: 'abc123' });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('cursor=abc123');
  });
});

// ── memory.export() ──

describe('memory.export()', () => {
  it('sends GET /v1/export with scope params', async () => {
    const fetchMock = mockFetch(200, { data: { facts: [] } });
    globalThis.fetch = fetchMock;
    const steno = new Steno('sk_test');

    await steno.memory.export('user', 'u1');

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.steno.ai/v1/export?scope=user&scope_id=u1');
    expect(opts.method).toBe('GET');
  });
});

// ── memory.addBatch() ──

describe('memory.addBatch()', () => {
  it('sends POST /v1/memory/batch with items', async () => {
    const fetchMock = mockFetch(200, { data: { results: [] } });
    globalThis.fetch = fetchMock;
    const steno = new Steno('sk_test');

    const items = [
      { scope: 'user', scopeId: 'u1', data: 'fact 1' },
      { scope: 'user', scopeId: 'u1', data: 'fact 2', inputType: 'raw_text' },
    ];
    await steno.memory.addBatch(items);

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.steno.ai/v1/memory/batch');
    expect(opts.method).toBe('POST');

    const body = JSON.parse(opts.body as string);
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toEqual({ scope: 'user', scope_id: 'u1', data: 'fact 1' });
    expect(body.items[1]).toEqual({ scope: 'user', scope_id: 'u1', data: 'fact 2', input_type: 'raw_text' });
  });
});

// ── memory.searchBatch() ──

describe('memory.searchBatch()', () => {
  it('sends POST /v1/memory/search/batch with queries', async () => {
    const fetchMock = mockFetch(200, { data: { results: [] } });
    globalThis.fetch = fetchMock;
    const steno = new Steno('sk_test');

    const queries = [
      { query: 'food', scope: 'user', scopeId: 'u1', limit: 5 },
      { query: 'work', scope: 'user', scopeId: 'u1' },
    ];
    await steno.memory.searchBatch(queries);

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.steno.ai/v1/memory/search/batch');
    expect(opts.method).toBe('POST');

    const body = JSON.parse(opts.body as string);
    expect(body.queries).toHaveLength(2);
    expect(body.queries[0]).toEqual({ query: 'food', scope: 'user', scope_id: 'u1', limit: 5 });
  });
});

// ── Graph API ──

describe('graph', () => {
  it('listEntities sends GET /v1/entities', async () => {
    const fetchMock = mockFetch(200, { data: { entities: [] } });
    globalThis.fetch = fetchMock;
    const steno = new Steno('sk_test');

    await steno.graph.listEntities({ limit: 10 });

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/entities?');
    expect(url).toContain('limit=10');
    expect(opts.method).toBe('GET');
  });

  it('listEntities works without options', async () => {
    const fetchMock = mockFetch(200, { data: { entities: [] } });
    globalThis.fetch = fetchMock;
    const steno = new Steno('sk_test');

    await steno.graph.listEntities();

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/entities?');
  });

  it('getEntity sends GET /v1/entities/:id', async () => {
    const fetchMock = mockFetch(200, { data: { id: 'ent_1', name: 'Pizza' } });
    globalThis.fetch = fetchMock;
    const steno = new Steno('sk_test');

    const entity = await steno.graph.getEntity('ent_1');

    expect(entity).toEqual({ id: 'ent_1', name: 'Pizza' });
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.steno.ai/v1/entities/ent_1');
  });

  it('getRelated sends GET /v1/entities/:id/graph', async () => {
    const fetchMock = mockFetch(200, { data: { nodes: [], edges: [] } });
    globalThis.fetch = fetchMock;
    const steno = new Steno('sk_test');

    await steno.graph.getRelated('ent_1', 2);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.steno.ai/v1/entities/ent_1/graph?depth=2');
  });

  it('getRelated works without depth', async () => {
    const fetchMock = mockFetch(200, { data: { nodes: [], edges: [] } });
    globalThis.fetch = fetchMock;
    const steno = new Steno('sk_test');

    await steno.graph.getRelated('ent_1');

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.steno.ai/v1/entities/ent_1/graph');
  });
});

// ── Webhooks API ──

describe('webhooks', () => {
  it('create sends POST /v1/webhooks', async () => {
    const fetchMock = mockFetch(200, { data: { id: 'wh_1', url: 'https://example.com/hook' } });
    globalThis.fetch = fetchMock;
    const steno = new Steno('sk_test');

    await steno.webhooks.create({
      url: 'https://example.com/hook',
      events: ['memory.created', 'memory.updated'],
      secret: 'whsec_123',
    });

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.steno.ai/v1/webhooks');
    expect(opts.method).toBe('POST');

    const body = JSON.parse(opts.body as string);
    expect(body).toEqual({
      url: 'https://example.com/hook',
      events: ['memory.created', 'memory.updated'],
      secret: 'whsec_123',
    });
  });

  it('list sends GET /v1/webhooks', async () => {
    const fetchMock = mockFetch(200, { data: [] });
    globalThis.fetch = fetchMock;
    const steno = new Steno('sk_test');

    await steno.webhooks.list();

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.steno.ai/v1/webhooks');
    expect(opts.method).toBe('GET');
  });

  it('delete sends DELETE /v1/webhooks/:id', async () => {
    const fetchMock = mockFetch(204, null);
    globalThis.fetch = fetchMock;
    const steno = new Steno('sk_test');

    await steno.webhooks.delete('wh_1');

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.steno.ai/v1/webhooks/wh_1');
    expect(opts.method).toBe('DELETE');
  });
});

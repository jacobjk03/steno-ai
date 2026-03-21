import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkProvider } from '../src/health.js';

const BASE_URL = 'http://localhost:11434/v1';

describe('checkProvider', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('available server returns models list', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: [{ id: 'mistral' }, { id: 'llama3:8b' }],
      }),
    });

    const result = await checkProvider(BASE_URL);

    expect(result.available).toBe(true);
    expect(result.models).toEqual(['mistral', 'llama3:8b']);
    expect(result.error).toBeUndefined();
  });

  it('unavailable server returns available: false with error', async () => {
    const err = new TypeError('fetch failed');
    globalThis.fetch = vi.fn().mockRejectedValue(err);

    const result = await checkProvider(BASE_URL);

    expect(result.available).toBe(false);
    expect(result.models).toEqual([]);
    expect(result.error).toBe('fetch failed');
  });

  it('timeout returns available: false', async () => {
    globalThis.fetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        init.signal?.addEventListener('abort', () => reject(err));
      });
    });

    const result = await checkProvider(BASE_URL, 10);

    expect(result.available).toBe(false);
    expect(result.models).toEqual([]);
    expect(result.error).toBeDefined();
  });
});

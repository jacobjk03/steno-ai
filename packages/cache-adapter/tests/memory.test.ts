import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryCacheAdapter } from '../src/memory.js';

describe('InMemoryCacheAdapter', () => {
  let cache: InMemoryCacheAdapter;

  beforeEach(() => {
    cache = new InMemoryCacheAdapter();
  });

  it('stores and retrieves a value', async () => {
    await cache.set('foo', 'bar');
    const result = await cache.get<string>('foo');
    expect(result).toBe('bar');
  });

  it('returns null for missing keys', async () => {
    const result = await cache.get('nonexistent');
    expect(result).toBeNull();
  });

  it('deletes a key', async () => {
    await cache.set('key', 'value');
    await cache.del('key');
    const result = await cache.get('key');
    expect(result).toBeNull();
  });

  it('respects TTL expiration', async () => {
    await cache.set('ttl-key', 'data', 1);
    const before = await cache.get<string>('ttl-key');
    expect(before).toBe('data');
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const after = await cache.get<string>('ttl-key');
    expect(after).toBeNull();
  }, 5000);

  it('increments a counter', async () => {
    expect(await cache.incr('counter')).toBe(1);
    expect(await cache.incr('counter')).toBe(2);
    expect(await cache.incr('counter')).toBe(3);
  });

  it('incr on expired key resets to 1', async () => {
    await cache.set('expiring-counter', 10, 1);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const result = await cache.incr('expiring-counter');
    expect(result).toBe(1);
  }, 5000);

  it('pings successfully', async () => {
    const result = await cache.ping();
    expect(result).toBe(true);
  });

  it('set overwrites existing value', async () => {
    await cache.set('key', 'original');
    await cache.set('key', 'updated');
    const result = await cache.get<string>('key');
    expect(result).toBe('updated');
  });

  it('expire updates TTL on existing key', async () => {
    await cache.set('exp-key', 'value');
    await cache.expire('exp-key', 1);
    const before = await cache.get<string>('exp-key');
    expect(before).toBe('value');
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const after = await cache.get<string>('exp-key');
    expect(after).toBeNull();
  }, 5000);
});

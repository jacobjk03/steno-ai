import type { CacheAdapter } from '@steno-ai/engine';

interface CacheEntry<T> {
  value: T;
  expiresAt: number | null;
}

export class InMemoryCacheAdapter implements CacheAdapter {
  private store = new Map<string, CacheEntry<unknown>>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.store.set(key, { value, expiresAt });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async incr(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (entry && entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.store.set(key, { value: 1, expiresAt: null });
      return 1;
    }
    const current = entry ? (entry.value as number) : 0;
    const next = current + 1;
    this.store.set(key, { value: next, expiresAt: entry?.expiresAt ?? null });
    return next;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    const entry = this.store.get(key);
    if (entry) {
      entry.expiresAt = Date.now() + ttlSeconds * 1000;
    }
  }

  async ping(): Promise<boolean> {
    return true;
  }
}

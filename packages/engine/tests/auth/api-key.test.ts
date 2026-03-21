import { describe, it, expect } from 'vitest';
import { generateApiKey, hashApiKey, verifyApiKey, extractPrefix } from '../../src/auth/index.js';

describe('generateApiKey', () => {
  it('generated key starts with sk_steno_', () => {
    const { key } = generateApiKey();
    expect(key.startsWith('sk_steno_')).toBe(true);
  });

  it('generated key is exactly 48 characters', () => {
    const { key } = generateApiKey();
    expect(key).toHaveLength(48);
  });

  it('100 generated keys are all unique', () => {
    const keys = Array.from({ length: 100 }, () => generateApiKey().key);
    const unique = new Set(keys);
    expect(unique.size).toBe(100);
  });

  it('prefix is the first 12 characters of the key', () => {
    const { key, prefix } = generateApiKey();
    expect(prefix).toBe(key.slice(0, 12));
  });

  it('prefix always starts with sk_steno_ (first 9 chars)', () => {
    for (let i = 0; i < 10; i++) {
      const { prefix } = generateApiKey();
      expect(prefix.startsWith('sk_steno_')).toBe(true);
    }
  });
});

describe('hashApiKey', () => {
  it('hash is different from the raw key', async () => {
    const { key } = generateApiKey();
    const hash = await hashApiKey(key);
    expect(hash).not.toBe(key);
  });

  it('hash is a non-empty string', async () => {
    const { key } = generateApiKey();
    const hash = await hashApiKey(key);
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('same key hashed twice produces different hashes (bcrypt salting)', async () => {
    const { key } = generateApiKey();
    const hash1 = await hashApiKey(key);
    const hash2 = await hashApiKey(key);
    expect(hash1).not.toBe(hash2);
  });
});

describe('verifyApiKey', () => {
  it('returns true for valid key against its hash', async () => {
    const { key } = generateApiKey();
    const hash = await hashApiKey(key);
    const result = await verifyApiKey(key, hash);
    expect(result).toBe(true);
  });

  it('returns false for a wrong key', async () => {
    const { key } = generateApiKey();
    const hash = await hashApiKey(key);
    const { key: wrongKey } = generateApiKey();
    const result = await verifyApiKey(wrongKey, hash);
    expect(result).toBe(false);
  });

  it('returns false for an empty string', async () => {
    const { key } = generateApiKey();
    const hash = await hashApiKey(key);
    const result = await verifyApiKey('', hash);
    expect(result).toBe(false);
  });
});

describe('extractPrefix', () => {
  it('extracts the first 12 characters', () => {
    const { key } = generateApiKey();
    const prefix = extractPrefix(key);
    expect(prefix).toBe(key.slice(0, 12));
  });

  it('extracted prefix matches the prefix returned by generateApiKey', () => {
    const { key, prefix } = generateApiKey();
    expect(extractPrefix(key)).toBe(prefix);
  });

  it('works on arbitrary strings', () => {
    expect(extractPrefix('abcdefghijklmnopqrstuvwxyz')).toBe('abcdefghijkl');
  });
});

import { describe, it, expect } from 'vitest';
import { hashInput } from '../../src/extraction/hasher.js';

describe('hashInput', () => {
  it('produces a 64-character hex string (SHA-256)', async () => {
    const hash = await hashInput({ type: 'conversation', data: 'hello' });
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — same input produces the same hash', async () => {
    const input = { type: 'raw_text', data: 'deterministic test' };
    const hash1 = await hashInput(input);
    const hash2 = await hashInput(input);
    expect(hash1).toBe(hash2);
  });

  it('different data produces different hashes', async () => {
    const hash1 = await hashInput({ type: 'raw_text', data: 'input A' });
    const hash2 = await hashInput({ type: 'raw_text', data: 'input B' });
    expect(hash1).not.toBe(hash2);
  });

  it('type is included in hash — same data with different type yields different hashes', async () => {
    const data = 'shared payload';
    const hash1 = await hashInput({ type: 'conversation', data });
    const hash2 = await hashInput({ type: 'document', data });
    expect(hash1).not.toBe(hash2);
  });

  it('handles object data (conversation with messages array)', async () => {
    const data = {
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ],
    };
    const hash = await hashInput({ type: 'conversation', data });
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles nested objects', async () => {
    const data = {
      level1: {
        level2: {
          level3: {
            value: 42,
            tags: ['a', 'b', 'c'],
          },
        },
      },
    };
    const hash = await hashInput({ type: 'document', data });
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('nested objects with different values produce different hashes', async () => {
    const base = { level1: { value: 1 } };
    const changed = { level1: { value: 2 } };
    const hash1 = await hashInput({ type: 'document', data: base });
    const hash2 = await hashInput({ type: 'document', data: changed });
    expect(hash1).not.toBe(hash2);
  });

  it('handles null data', async () => {
    const hash = await hashInput({ type: 'raw_text', data: null });
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles numeric data', async () => {
    const hash1 = await hashInput({ type: 'raw_text', data: 42 });
    const hash2 = await hashInput({ type: 'raw_text', data: 43 });
    expect(hash1).toHaveLength(64);
    expect(hash1).not.toBe(hash2);
  });

  it('handles array data', async () => {
    const hash1 = await hashInput({ type: 'code', data: ['line1', 'line2'] });
    const hash2 = await hashInput({ type: 'code', data: ['line2', 'line1'] });
    // order matters in JSON serialisation
    expect(hash1).not.toBe(hash2);
  });

  it('produces only lowercase hex characters', async () => {
    const hash = await hashInput({ type: 'conversation', data: { msg: 'test' } });
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });
});

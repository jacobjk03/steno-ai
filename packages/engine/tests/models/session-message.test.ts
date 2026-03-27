import { describe, expect, it } from 'bun:test';
import { SessionMessageSchema, CreateSessionMessageSchema } from '../../src/models/session-message.js';

describe('SessionMessageSchema', () => {
  it('accepts a valid session message', () => {
    const result = SessionMessageSchema.safeParse({
      id: '11111111-1111-1111-1111-111111111111',
      sessionId: '22222222-2222-2222-2222-222222222222',
      tenantId: '33333333-3333-3333-3333-333333333333',
      role: 'user',
      content: 'I prefer dark mode',
      turnNumber: 0,
      extractionId: null,
      createdAt: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing content', () => {
    const result = SessionMessageSchema.safeParse({
      id: '11111111-1111-1111-1111-111111111111',
      sessionId: '22222222-2222-2222-2222-222222222222',
      tenantId: '33333333-3333-3333-3333-333333333333',
      role: 'user',
      turnNumber: 0,
    });
    expect(result.success).toBe(false);
  });

  it('defaults extractionId to null', () => {
    const result = CreateSessionMessageSchema.safeParse({
      sessionId: '22222222-2222-2222-2222-222222222222',
      tenantId: '33333333-3333-3333-3333-333333333333',
      role: 'user',
      content: 'test',
      turnNumber: 0,
    });
    expect(result.success).toBe(true);
  });
});

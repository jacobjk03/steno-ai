import { describe, expect, it, beforeEach, vi } from 'vitest';

function createMockStorage() {
  const messages: Array<{ id: string; sessionId: string; tenantId: string; role: string; content: string; turnNumber: number; extractionId: string | null; createdAt: Date }> = [];
  const sessions: Array<{ id: string; endedAt: Date | null; summary?: string; topics?: string[] }> = [];

  return {
    messages,
    sessions,
    addSessionMessage: vi.fn(async (msg: any) => {
      messages.push({ ...msg, extractionId: null, createdAt: new Date() });
    }),
    getSessionMessages: vi.fn(async (_tenantId: string, sessionId: string, options?: { unextractedOnly?: boolean }) => {
      let filtered = messages.filter(m => m.sessionId === sessionId);
      if (options?.unextractedOnly) {
        filtered = filtered.filter(m => m.extractionId === null);
      }
      return filtered.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        turnNumber: m.turnNumber,
        createdAt: m.createdAt,
      }));
    }),
    markMessagesExtracted: vi.fn(async (messageIds: string[], extractionId: string) => {
      for (const msg of messages) {
        if (messageIds.includes(msg.id)) msg.extractionId = extractionId;
      }
    }),
    getSessionsByScope: vi.fn(async () => ({ data: sessions.filter(s => !s.endedAt), cursor: null, hasMore: false })),
    createSession: vi.fn(async (s: any) => {
      const session = { ...s, startedAt: new Date(), endedAt: null, summary: null, topics: [], messageCount: 0, factCount: 0, metadata: {}, createdAt: new Date() };
      sessions.push(session);
      return session;
    }),
    endSession: vi.fn(async (_tid: string, id: string, summary?: string, topics?: string[]) => {
      const s = sessions.find(s => s.id === id);
      if (s) { s.endedAt = new Date(); s.summary = summary; s.topics = topics; }
      return s;
    }),
    getSession: vi.fn(async (_tid: string, id: string) => sessions.find(s => s.id === id) ?? null),
    getFactsByScope: vi.fn(async () => ({ data: [], cursor: null, hasMore: false })),
    getEntitiesForTenant: vi.fn(async () => ({ data: [], cursor: null, hasMore: false })),
    ping: vi.fn(async () => true),
  };
}

describe('Session Message Storage', () => {
  let storage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it('stores messages with turn numbers', async () => {
    const sessionId = '11111111-1111-1111-1111-111111111111';
    const tenantId = '22222222-2222-2222-2222-222222222222';

    await storage.addSessionMessage({ id: crypto.randomUUID(), sessionId, tenantId, role: 'user', content: 'first message', turnNumber: 0 });
    await storage.addSessionMessage({ id: crypto.randomUUID(), sessionId, tenantId, role: 'user', content: 'second message', turnNumber: 1 });

    const all = await storage.getSessionMessages(tenantId, sessionId);
    expect(all).toHaveLength(2);
    expect(all[0].content).toBe('first message');
    expect(all[1].turnNumber).toBe(1);
  });

  it('filters unextracted messages', async () => {
    const sessionId = '11111111-1111-1111-1111-111111111111';
    const tenantId = '22222222-2222-2222-2222-222222222222';
    const msg1Id = crypto.randomUUID();
    const msg2Id = crypto.randomUUID();

    await storage.addSessionMessage({ id: msg1Id, sessionId, tenantId, role: 'user', content: 'extracted', turnNumber: 0 });
    await storage.addSessionMessage({ id: msg2Id, sessionId, tenantId, role: 'user', content: 'pending', turnNumber: 1 });

    await storage.markMessagesExtracted([msg1Id], 'extraction-1');

    const unextracted = await storage.getSessionMessages(tenantId, sessionId, { unextractedOnly: true });
    expect(unextracted).toHaveLength(1);
    expect(unextracted[0].content).toBe('pending');
  });

  it('formats conversation with timestamps', () => {
    const messages = [
      { role: 'user', content: 'I prefer dark mode', createdAt: new Date('2026-03-27T10:00:00Z') },
      { role: 'user', content: 'My favorite color is blue', createdAt: new Date('2026-03-27T10:05:00Z') },
    ];

    const formatted = messages.map(m => {
      const time = m.createdAt.toISOString().replace('T', ' ').slice(0, 19);
      return `[${m.role} @ ${time}]: ${m.content}`;
    }).join('\n\n');

    expect(formatted).toContain('[user @ 2026-03-27 10:00:00]: I prefer dark mode');
    expect(formatted).toContain('[user @ 2026-03-27 10:05:00]: My favorite color is blue');
  });
});

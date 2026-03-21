import type { StorageAdapter } from '../adapters/storage.js';
import type { LLMAdapter } from '../adapters/llm.js';
import type { Session } from '../models/session.js';
import type { SessionScope } from '../config.js';

export async function startSession(
  storage: StorageAdapter,
  tenantId: string,
  scope: SessionScope,
  scopeId: string,
  metadata?: Record<string, unknown>,
): Promise<Session> {
  const id = crypto.randomUUID();
  return storage.createSession({
    id,
    tenantId,
    scope,
    scopeId,
    metadata: metadata ?? {},
  });
}

export async function endSession(
  storage: StorageAdapter,
  llm: LLMAdapter,
  tenantId: string,
  sessionId: string,
): Promise<Session> {
  // 1. Get session
  const session = await storage.getSession(tenantId, sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);
  if (session.endedAt) throw new Error(`Session ${sessionId} already ended`);

  // 2. Get facts created during this session
  const facts = await storage.getFactsByScope(tenantId, session.scope, session.scopeId, { limit: 100 });
  const sessionFacts = facts.data.filter(f => f.sessionId === sessionId);

  // 3. Generate summary if there are facts
  let summary: string | undefined;
  let topics: string[] | undefined;

  if (sessionFacts.length > 0) {
    const factContents = sessionFacts.map(f => f.content).join('\n');

    const response = await llm.complete([
      {
        role: 'system',
        content: 'Summarize the following facts from a conversation session in 2-3 sentences. Also extract the main topics (as a JSON array of strings). Return JSON: {"summary": "...", "topics": ["..."]}',
      },
      {
        role: 'user',
        content: factContents,
      },
    ], { temperature: 0, responseFormat: 'json' });

    try {
      const parsed = JSON.parse(response.content);
      summary = typeof parsed.summary === 'string' ? parsed.summary : undefined;
      topics = Array.isArray(parsed.topics)
        ? parsed.topics.filter((t: unknown): t is string => typeof t === 'string')
        : undefined;
    } catch {
      // If JSON parse fails, use raw content as summary
      summary = response.content;
    }
  }

  // 4. End the session
  return storage.endSession(tenantId, sessionId, summary, topics);
}

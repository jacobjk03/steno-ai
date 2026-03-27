/**
 * Find an active (not ended) session for the given scope, or create a new one.
 */
export async function getOrCreateActiveSession(storage, tenantId, scope, scopeId) {
    // Fetch a few recent sessions — the active one (if any) is likely the most recent,
    // but we check a small batch in case the latest was already ended.
    const sessions = await storage.getSessionsByScope(tenantId, scope, scopeId, { limit: 5 });
    const active = sessions.data.find(s => !s.endedAt);
    if (active)
        return active;
    return startSession(storage, tenantId, scope, scopeId);
}
export async function startSession(storage, tenantId, scope, scopeId, metadata) {
    const id = crypto.randomUUID();
    return storage.createSession({
        id,
        tenantId,
        scope,
        scopeId,
        metadata: metadata ?? {},
    });
}
export async function endSession(storage, llm, tenantId, sessionId) {
    // 1. Get session
    const session = await storage.getSession(tenantId, sessionId);
    if (!session)
        throw new Error(`Session ${sessionId} not found`);
    if (session.endedAt)
        throw new Error(`Session ${sessionId} already ended`);
    // 2. Get facts created during this session
    const facts = await storage.getFactsByScope(tenantId, session.scope, session.scopeId, { limit: 100 });
    const sessionFacts = facts.data.filter(f => f.sessionId === sessionId);
    // 3. Generate summary if there are facts
    let summary;
    let topics;
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
                ? parsed.topics.filter((t) => typeof t === 'string')
                : undefined;
        }
        catch {
            // If JSON parse fails, use raw content as summary
            summary = response.content;
        }
    }
    // 4. End the session
    return storage.endSession(tenantId, sessionId, summary, topics);
}
//# sourceMappingURL=manager.js.map
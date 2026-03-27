import type { StorageAdapter } from '../adapters/storage.js';
import type { LLMAdapter } from '../adapters/llm.js';
import type { Session } from '../models/session.js';
import type { SessionScope } from '../config.js';
/**
 * Find an active (not ended) session for the given scope, or create a new one.
 */
export declare function getOrCreateActiveSession(storage: StorageAdapter, tenantId: string, scope: SessionScope, scopeId: string): Promise<Session>;
export declare function startSession(storage: StorageAdapter, tenantId: string, scope: SessionScope, scopeId: string, metadata?: Record<string, unknown>): Promise<Session>;
export declare function endSession(storage: StorageAdapter, llm: LLMAdapter, tenantId: string, sessionId: string): Promise<Session>;
//# sourceMappingURL=manager.d.ts.map
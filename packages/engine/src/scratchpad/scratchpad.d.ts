import type { StorageAdapter } from '../adapters/storage.js';
import type { LLMAdapter } from '../adapters/llm.js';
import type { Scope } from '../config.js';
/**
 * Get or create a scratchpad for a scope.
 * The scratchpad is stored as a special fact with tag 'scratchpad'.
 */
export declare function getScratchpad(storage: StorageAdapter, tenantId: string, scope: Scope, scopeId: string): Promise<string>;
/**
 * Update the scratchpad after an extraction.
 * Appends new facts to the existing scratchpad, compresses if too long.
 */
export declare function updateScratchpad(storage: StorageAdapter, llm: LLMAdapter, tenantId: string, scope: Scope, scopeId: string, newFacts: string[]): Promise<void>;
/**
 * Compress the scratchpad using an LLM.
 * Preserves the most important information while reducing size.
 */
export declare function compressScratchpad(llm: LLMAdapter, content: string): Promise<string>;
/**
 * Get filtered scratchpad content relevant to a query.
 */
export declare function getRelevantScratchpad(storage: StorageAdapter, llm: LLMAdapter, tenantId: string, scope: Scope, scopeId: string, query: string): Promise<string>;
//# sourceMappingURL=scratchpad.d.ts.map
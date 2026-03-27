/**
 * Cross-Fact Edge Linker — Intelligent Relationship Detection
 *
 * After extraction, finds existing facts that share entities with new facts
 * AND are semantically similar (not just any shared entity). Creates
 * 'relates_to' edges only when facts are actually about the same topic.
 *
 * Heuristics:
 * 1. Shared entity (required) — both facts mention the same entity
 * 2. Content similarity (required) — facts have overlapping keywords (>30% overlap)
 * 3. Temporal proximity (bonus) — facts created within 7 days get priority
 * 4. Skip generic entities — "user" entity is too broad to link on
 */
import type { StorageAdapter } from '../adapters/storage.js';
/**
 * Link newly created facts to existing related facts through shared entities.
 * Uses keyword overlap + temporal proximity to determine relevance.
 *
 * Only creates edges when facts are genuinely related — not just because
 * they both mention "Steno" or "user".
 */
export declare function linkRelatedFacts(storage: StorageAdapter, tenantId: string, newFactIds: string[], entityIdMap: Map<string, string>): Promise<number>;
//# sourceMappingURL=cross-linker.d.ts.map
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
import type { Fact } from '../models/fact.js';

const GENERIC_ENTITIES = new Set(['user', 'assistant', 'navia', 'steno']);
const MIN_KEYWORD_OVERLAP = 0.25; // 25% of keywords must overlap
const MAX_LINKS_PER_FACT = 3; // Don't create too many edges per new fact
const TEMPORAL_WINDOW_DAYS = 14; // Prefer facts within 2 weeks

/**
 * Extract meaningful keywords from fact content for similarity comparison.
 * Strips stop words, lowercases, returns unique tokens.
 */
function extractKeywords(content: string): Set<string> {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'and', 'but', 'or',
    'not', 'no', 'nor', 'so', 'yet', 'both', 'each', 'few', 'more',
    'most', 'other', 'some', 'such', 'than', 'too', 'very', 'just',
    'about', 'up', 'out', 'if', 'then', 'that', 'this', 'these', 'those',
    'it', 'its', 'user', 'users', 'they', 'them', 'their', 'he', 'she',
  ]);

  return new Set(
    content.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !stopWords.has(w))
  );
}

/**
 * Calculate keyword overlap ratio between two facts.
 * Returns 0-1 where 1 = identical keywords.
 */
function keywordOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) {
    if (b.has(word)) shared++;
  }
  const minSize = Math.min(a.size, b.size);
  return shared / minSize;
}

/**
 * Check if two facts are temporally close (within TEMPORAL_WINDOW_DAYS).
 */
function isTemporallyClose(a: Fact, b: Fact): boolean {
  const aDate = new Date(a.createdAt).getTime();
  const bDate = new Date(b.createdAt).getTime();
  const diffDays = Math.abs(aDate - bDate) / (1000 * 60 * 60 * 24);
  return diffDays <= TEMPORAL_WINDOW_DAYS;
}

/**
 * Link newly created facts to existing related facts through shared entities.
 * Uses keyword overlap + temporal proximity to determine relevance.
 *
 * Only creates edges when facts are genuinely related — not just because
 * they both mention "Steno" or "user".
 */
export async function linkRelatedFacts(
  storage: StorageAdapter,
  tenantId: string,
  newFactIds: string[],
  entityIdMap: Map<string, string>,
): Promise<number> {
  if (newFactIds.length === 0 || entityIdMap.size === 0) return 0;

  let edgesCreated = 0;

  // Get the new facts' content for keyword extraction
  const newFacts = await storage.getFactsByIds(tenantId, newFactIds);
  if (newFacts.length === 0) return 0;

  const newFactKeywords = new Map<string, Set<string>>();
  for (const f of newFacts) {
    newFactKeywords.set(f.id, extractKeywords(f.content));
  }

  // For each NON-GENERIC entity, find existing facts that also mention it
  for (const [canonicalName, entityId] of entityIdMap) {
    if (GENERIC_ENTITIES.has(canonicalName)) continue; // Skip "user", "navia", etc.

    try {
      const linkedFacts = await storage.getFactsForEntity(tenantId, entityId, { limit: 20 });
      if (linkedFacts.data.length < 2) continue;

      const newFactSet = new Set(newFactIds);
      const existingFacts = linkedFacts.data.filter(f =>
        !newFactSet.has(f.id) &&
        !f.tags?.includes('scratchpad') // Skip scratchpad blobs
      );

      for (const newFact of newFacts) {
        const newKw = newFactKeywords.get(newFact.id);
        if (!newKw || newKw.size < 2) continue; // Too short to compare

        let linksForThisFact = 0;

        for (const existingFact of existingFacts) {
          if (linksForThisFact >= MAX_LINKS_PER_FACT) break;

          const existingKw = extractKeywords(existingFact.content);
          const overlap = keywordOverlap(newKw, existingKw);

          // Must have meaningful keyword overlap
          if (overlap < MIN_KEYWORD_OVERLAP) continue;

          // Boost score for temporal proximity
          const temporalBoost = isTemporallyClose(newFact, existingFact) ? 0.1 : 0;
          const relevanceScore = overlap + temporalBoost;

          try {
            await storage.createEdge({
              id: crypto.randomUUID(),
              tenantId,
              sourceId: entityId,
              targetId: entityId,
              relation: 'relates_to',
              edgeType: 'associative',
              weight: Math.min(relevanceScore, 1.0),
              factId: newFact.id,
              confidence: overlap,
              metadata: {
                linkedFactId: existingFact.id,
                reason: 'shared_entity_and_content',
                entity: canonicalName,
                keywordOverlap: overlap.toFixed(2),
              },
            });
            edgesCreated++;
            linksForThisFact++;
          } catch {
            // Duplicate or constraint — skip
          }
        }
      }
    } catch {
      // Entity lookup failed — continue
    }
  }

  if (edgesCreated > 0) {
    console.error(`[steno] Cross-linked ${edgesCreated} related facts via shared entities`);
  }

  return edgesCreated;
}

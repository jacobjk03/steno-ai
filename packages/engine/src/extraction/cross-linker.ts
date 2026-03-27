/**
 * Cross-Fact Edge Linker — LLM-Powered Relationship Classification
 *
 * After extraction, finds existing facts that share entities with new facts,
 * then uses ONE LLM call to classify the relationship structure:
 * - part_of: "session ingestion" is part_of "steno roadmap"
 * - has_child: "steno roadmap" has_child "session ingestion"
 * - extends: new fact adds detail to existing
 * - derives: new fact is inferred from existing
 * - relates_to: loosely related (fallback)
 *
 * Heuristics filter candidates FIRST (shared entity + keyword overlap),
 * then ONE LLM call classifies the batch. No wasted LLM calls on unrelated facts.
 */

import type { StorageAdapter } from '../adapters/storage.js';
import type { LLMAdapter } from '../adapters/llm.js';
import type { Fact } from '../models/fact.js';

const GENERIC_ENTITIES = new Set(['user', 'assistant', 'navia']);
const MIN_KEYWORD_OVERLAP = 0.20;
const MAX_CANDIDATES_PER_ENTITY = 5;

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

function keywordOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) { if (b.has(word)) shared++; }
  return shared / Math.min(a.size, b.size);
}

interface CandidatePair {
  newFact: Fact;
  existingFact: Fact;
  entityId: string;
  entityName: string;
  overlap: number;
}

/**
 * Link newly created facts to existing related facts.
 * Step 1: Heuristic filter (shared entity + keyword overlap)
 * Step 2: ONE LLM call to classify relationship types for the batch
 * Step 3: Create typed edges (part_of, has_child, extends, derives, relates_to)
 */
export async function linkRelatedFacts(
  storage: StorageAdapter,
  tenantId: string,
  newFactIds: string[],
  entityIdMap: Map<string, string>,
  llm?: LLMAdapter,
): Promise<number> {
  const mapSize = entityIdMap instanceof Map ? entityIdMap.size : Object.keys(entityIdMap).length;
  if (newFactIds.length === 0 || mapSize === 0) return 0;

  // Normalize entityIdMap to array of entries (handle both Map and plain object)
  const entityEntries: Array<[string, string]> = entityIdMap instanceof Map
    ? Array.from(entityIdMap.entries())
    : Object.entries(entityIdMap) as Array<[string, string]>;

  let newFacts: any[];
  try {
    newFacts = await storage.getFactsByIds(tenantId, newFactIds);
  } catch {
    return 0;
  }
  if (!newFacts || newFacts.length === 0) return 0;

  const newFactKeywords = new Map<string, Set<string>>();
  for (const f of newFacts) {
    newFactKeywords.set(f.id, extractKeywords(f.content));
  }

  // Step 1: Find candidate pairs via heuristic
  const candidates: CandidatePair[] = [];
  const newFactSet = new Set(newFactIds);

  for (const [canonicalName, entityId] of entityEntries) {
    if (GENERIC_ENTITIES.has(canonicalName)) continue;

    try {
      const linkedFacts = await storage.getFactsForEntity(tenantId, entityId, { limit: 20 });
      if (linkedFacts.data.length < 2) continue;

      const existingFacts = linkedFacts.data.filter(f =>
        !newFactSet.has(f.id) && !f.tags?.includes('scratchpad')
      );

      for (const newFact of newFacts) {
        const newKw = newFactKeywords.get(newFact.id);
        if (!newKw || newKw.size < 2) continue;

        let count = 0;
        for (const existingFact of existingFacts) {
          if (count >= MAX_CANDIDATES_PER_ENTITY) break;
          const existingKw = extractKeywords(existingFact.content);
          const overlap = keywordOverlap(newKw, existingKw);
          if (overlap >= MIN_KEYWORD_OVERLAP) {
            candidates.push({ newFact, existingFact, entityId, entityName: canonicalName, overlap });
            count++;
          }
        }
      }
    } catch { /* continue */ }
  }

  if (candidates.length === 0) return 0;

  // Deduplicate by fact pair
  const seen = new Set<string>();
  const uniqueCandidates = candidates.filter(c => {
    const key = `${c.newFact.id}|${c.existingFact.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Step 2: ONE LLM call to classify all relationships
  let classifications: Array<{ index: number; relation: string; direction: 'forward' | 'reverse' }> = [];

  if (llm && uniqueCandidates.length > 0) {
    try {
      const pairsText = uniqueCandidates.map((c, i) =>
        `[${i}] NEW: "${c.newFact.content.slice(0, 150)}"\n    EXISTING: "${c.existingFact.content.slice(0, 150)}"\n    SHARED ENTITY: ${c.entityName}`
      ).join('\n\n');

      const response = await llm.complete([
        {
          role: 'system',
          content: `Classify the relationship between each pair of facts. For each pair, output:
- relation: one of "part_of", "has_child", "extends", "derives", "precedes", "depends_on", "deadline", "relates_to"
- direction: "forward" (NEW → EXISTING) or "reverse" (EXISTING → NEW)

Relationship meanings:
- part_of: the NEW fact is a component/subtask/member of the EXISTING fact
- has_child: the NEW fact is a parent/container of the EXISTING fact
- extends: the NEW fact adds detail to the EXISTING fact
- derives: the NEW fact is inferred from the EXISTING fact
- precedes: the NEW fact should happen BEFORE the EXISTING fact (ordering)
- depends_on: the NEW fact REQUIRES the EXISTING fact to be done first (blocking)
- deadline: the NEW fact must be completed before the EXISTING fact (time constraint)
- relates_to: loosely related but no clear hierarchy or dependency

Return ONLY a JSON array: [{"index": 0, "relation": "part_of", "direction": "forward"}, ...]`
        },
        { role: 'user', content: pairsText }
      ], { temperature: 0, responseFormat: 'json' });

      const parsed = JSON.parse(response.content);
      // LLM might return array directly or wrapped: {"classifications": [...]} or {"results": [...]}
      const arr = Array.isArray(parsed) ? parsed
        : Array.isArray(parsed?.classifications) ? parsed.classifications
        : Array.isArray(parsed?.results) ? parsed.results
        : Array.isArray(parsed?.edges) ? parsed.edges
        : null;
      classifications = arr ?? uniqueCandidates.map((_, i) => ({ index: i, relation: 'relates_to', direction: 'forward' as const }));
    } catch {
      // LLM failed — fall back to heuristic relates_to
      classifications = uniqueCandidates.map((_, i) => ({ index: i, relation: 'relates_to', direction: 'forward' as const }));
    }
  } else {
    // No LLM — all relates_to
    classifications = uniqueCandidates.map((_, i) => ({ index: i, relation: 'relates_to', direction: 'forward' as const }));
  }

  // Step 3: Create typed edges
  let edgesCreated = 0;

  for (const cls of classifications) {
    const candidate = uniqueCandidates[cls.index];
    if (!candidate) continue;

    const validRelations = ['part_of', 'has_child', 'extends', 'derives', 'precedes', 'depends_on', 'deadline', 'relates_to'];
    const relation = validRelations.includes(cls.relation) ? cls.relation : 'relates_to';

    // Map relation to edge type
    const edgeType = relation === 'extends' ? 'extends' as const
      : relation === 'derives' ? 'derives' as const
      : relation === 'precedes' ? 'precedes' as const
      : relation === 'depends_on' ? 'depends_on' as const
      : relation === 'deadline' ? 'deadline' as const
      : relation === 'part_of' || relation === 'has_child' ? 'hierarchical' as const
      : 'associative' as const;

    // Determine source/target based on direction
    const sourceFactId = cls.direction === 'forward' ? candidate.newFact.id : candidate.existingFact.id;
    const targetFactId = cls.direction === 'forward' ? candidate.existingFact.id : candidate.newFact.id;

    try {
      await storage.createEdge({
        id: crypto.randomUUID(),
        tenantId,
        sourceId: candidate.entityId,
        targetId: candidate.entityId,
        relation,
        edgeType,
        weight: Math.min(candidate.overlap + 0.2, 1.0),
        factId: sourceFactId,
        confidence: candidate.overlap,
        metadata: {
          sourceFactId,
          targetFactId,
          reason: llm ? 'llm_classified' : 'heuristic_keyword_overlap',
          entity: candidate.entityName,
          keywordOverlap: candidate.overlap.toFixed(2),
        },
      });
      edgesCreated++;
    } catch { /* duplicate or constraint */ }
  }

  if (edgesCreated > 0) {
    console.error(`[steno] Cross-linked ${edgesCreated} facts (${llm ? 'LLM-classified' : 'heuristic'}): ${uniqueCandidates.map(c => c.entityName).filter((v, i, a) => a.indexOf(v) === i).join(', ')}`);
  }

  return edgesCreated;
}

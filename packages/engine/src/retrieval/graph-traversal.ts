import type { StorageAdapter } from '../adapters/storage.js';
import type { EmbeddingAdapter } from '../adapters/embedding.js';
import type { Candidate } from './types.js';

export interface GraphSearchConfig {
  maxDepth: number;       // default 3, max 5
  maxEntities: number;    // default 200
  asOf?: Date;            // point-in-time temporal filter
}

const DEFAULT_MAX_DEPTH = 3;
const MAX_ALLOWED_DEPTH = 5;
const DEFAULT_MAX_ENTITIES = 200;
const MIN_TOKEN_LENGTH = 3;

/** Known entity types to search against for each token */
const ENTITY_TYPES = ['person', 'organization', 'location', 'topic', 'concept', 'product', 'event'] as const;

/**
 * Tokenize query into candidate entity names.
 * Splits on whitespace, filters short words (< 3 chars), lowercases for canonical lookup.
 */
export function tokenizeQuery(query: string): string[] {
  return query
    .split(/\s+/)
    .map((t) => t.replace(/[^\w-]/g, ''))
    .filter((t) => t.length >= MIN_TOKEN_LENGTH)
    .map((t) => t.toLowerCase());
}

/**
 * Graph-based retrieval module.
 *
 * 1. Extracts potential entity names from query (simple tokenization)
 * 2. For each token, tries to find matching entities by canonical name
 * 3. Uses found entity IDs as seeds for graphTraversal
 * 4. Gets facts connected to discovered entities via getFactsForEntity
 * 5. Assigns graphScore based on hop distance: 1/(2^hop_depth)
 *    - 0-hop (seed) = 1.0
 *    - 1-hop = 0.5
 *    - 2-hop = 0.25
 *    - 3-hop = 0.125
 */
export async function graphSearch(
  storage: StorageAdapter,
  _embedding: EmbeddingAdapter,
  query: string,
  tenantId: string,
  _scope: string,
  _scopeId: string,
  limit: number,
  config?: Partial<GraphSearchConfig>,
): Promise<Candidate[]> {
  const maxDepth = Math.min(config?.maxDepth ?? DEFAULT_MAX_DEPTH, MAX_ALLOWED_DEPTH);
  const maxEntities = Math.min(config?.maxEntities ?? DEFAULT_MAX_ENTITIES, 500);

  // 1. Tokenize query, find matching entities
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return [];

  const seedEntityIds: string[] = [];
  for (const token of tokens) {
    for (const entityType of ENTITY_TYPES) {
      const entity = await storage.findEntityByCanonicalName(tenantId, token, entityType);
      if (entity && !seedEntityIds.includes(entity.id)) {
        seedEntityIds.push(entity.id);
      }
    }
  }

  if (seedEntityIds.length === 0) return [];

  // 2. Graph traversal from seed entities
  const traversalResult = await storage.graphTraversal({
    tenantId,
    entityIds: seedEntityIds,
    maxDepth,
    maxEntities,
    asOf: config?.asOf,
  });

  if (traversalResult.entities.length === 0) return [];

  // Build hop-depth map from traversal result using BFS from seed entities
  // via the edge list returned by the traversal
  const entityHopMap = new Map<string, number>();

  // Initialize seed entities at depth 0
  for (const entity of traversalResult.entities) {
    if (seedEntityIds.includes(entity.id)) {
      entityHopMap.set(entity.id, 0);
    }
  }

  // Build adjacency list from edges
  const adjacency = new Map<string, string[]>();
  for (const edge of traversalResult.edges) {
    if (!adjacency.has(edge.sourceId)) adjacency.set(edge.sourceId, []);
    if (!adjacency.has(edge.targetId)) adjacency.set(edge.targetId, []);
    adjacency.get(edge.sourceId)!.push(edge.targetId);
    adjacency.get(edge.targetId)!.push(edge.sourceId);
  }

  // BFS to compute min hop depth for all reachable entities
  const queue = [...entityHopMap.keys()];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentDepth = entityHopMap.get(currentId)!;
    const neighbors = adjacency.get(currentId) ?? [];
    for (const neighborId of neighbors) {
      if (!entityHopMap.has(neighborId)) {
        entityHopMap.set(neighborId, currentDepth + 1);
        queue.push(neighborId);
      }
    }
  }

  // Any entity not reached by BFS gets maxDepth
  for (const entity of traversalResult.entities) {
    if (!entityHopMap.has(entity.id)) {
      entityHopMap.set(entity.id, maxDepth);
    }
  }

  // 3. For each discovered entity, get facts via getFactsForEntity
  const candidateMap = new Map<string, Candidate>();

  for (const entity of traversalResult.entities) {
    const hopDepth = entityHopMap.get(entity.id) ?? maxDepth;
    const graphScore = 1 / Math.pow(2, hopDepth);

    const factsResult = await storage.getFactsForEntity(tenantId, entity.id, {
      limit: limit,
    });

    for (const fact of factsResult.data) {
      const existing = candidateMap.get(fact.id);
      if (existing) {
        // Keep the higher graph score (shorter path)
        if (graphScore > existing.graphScore) {
          existing.graphScore = graphScore;
        }
      } else {
        candidateMap.set(fact.id, {
          fact,
          vectorScore: 0,
          keywordScore: 0,
          graphScore,
          recencyScore: 0,
          salienceScore: 0,
          source: 'graph' as const,
        });
      }
    }
  }

  // 4. Return candidates, sorted by graphScore descending, limited
  return Array.from(candidateMap.values())
    .sort((a, b) => b.graphScore - a.graphScore)
    .slice(0, limit);
}

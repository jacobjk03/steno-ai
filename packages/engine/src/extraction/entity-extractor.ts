import type { StorageAdapter } from '../adapters/storage.js';
import type { EmbeddingAdapter } from '../adapters/embedding.js';
import type { ExtractedEntity, ExtractedEdge } from './types.js';

export interface EntityPersistenceResult {
  entitiesCreated: number;
  edgesCreated: number;
  entityIdMap: Map<string, string>; // canonicalName → entity.id
}

/**
 * Create or find all entities in the database.
 * Does NOT link entities to any fact or create edges.
 * Returns a map of canonicalName → entity.id for use in subsequent operations.
 */
export async function buildEntityIdMap(
  storage: StorageAdapter,
  embedding: EmbeddingAdapter,
  tenantId: string,
  entities: ExtractedEntity[],
): Promise<{ entityIdMap: Map<string, string>; entitiesCreated: number }> {
  const entityIdMap = new Map<string, string>();
  let entitiesCreated = 0;

  // Deduplicate entities by canonical name within this batch
  const uniqueEntities = new Map<string, ExtractedEntity>();
  for (const entity of entities) {
    if (!uniqueEntities.has(entity.canonicalName)) {
      uniqueEntities.set(entity.canonicalName, entity);
    }
  }

  // Create or find each entity
  for (const entity of uniqueEntities.values()) {
    const existing = await storage.findEntityByCanonicalName(
      tenantId,
      entity.canonicalName,
      entity.entityType,
    );

    if (existing) {
      entityIdMap.set(entity.canonicalName, existing.id);
    } else {
      const id = crypto.randomUUID();
      const emb = await embedding.embed(entity.name);
      await storage.createEntity({
        ...entity,
        id,
        tenantId,
        embedding: emb,
        embeddingModel: embedding.model,
        embeddingDim: embedding.dimensions,
      });
      entityIdMap.set(entity.canonicalName, id);
      entitiesCreated++;
    }
  }

  return { entityIdMap, entitiesCreated };
}

/**
 * Create edges between already-persisted entities.
 * Uses the entityIdMap built by buildEntityIdMap.
 */
export async function persistEdges(
  storage: StorageAdapter,
  tenantId: string,
  factId: string,
  edges: ExtractedEdge[],
  entityIdMap: Map<string, string>,
): Promise<number> {
  let edgesCreated = 0;
  for (const edge of edges) {
    const sourceId = entityIdMap.get(edge.sourceName);
    const targetId = entityIdMap.get(edge.targetName);
    if (sourceId && targetId) {
      await storage.createEdge({
        tenantId,
        sourceId,
        targetId,
        relation: edge.relation,
        edgeType: edge.edgeType,
        confidence: edge.confidence,
        weight: 1.0,
        metadata: {},
        factId,
        id: crypto.randomUUID(),
      });
      edgesCreated++;
    }
    // If source or target entity not found, silently skip the edge
  }
  return edgesCreated;
}

/**
 * Persist extracted entities and edges to the database.
 * - Creates new entities if canonical name doesn't exist for this tenant
 * - Reuses existing entities if canonical name matches
 * - Links all entities to the fact via fact_entities junction
 * - Creates edges between entities
 *
 * @deprecated Use buildEntityIdMap + persistEdges directly for better control.
 * This function is kept for backward compatibility.
 */
export async function persistEntitiesAndEdges(
  storage: StorageAdapter,
  embedding: EmbeddingAdapter,
  tenantId: string,
  factId: string,
  entities: ExtractedEntity[],
  edges: ExtractedEdge[],
): Promise<EntityPersistenceResult> {
  const { entityIdMap, entitiesCreated } = await buildEntityIdMap(
    storage,
    embedding,
    tenantId,
    entities,
  );

  // Link all entities to this fact
  for (const [canonicalName, entityId] of entityIdMap) {
    void canonicalName; // used as key only
    await storage.linkFactEntity(factId, entityId, 'mentioned');
  }

  const edgesCreated = await persistEdges(storage, tenantId, factId, edges, entityIdMap);

  return { entitiesCreated, edgesCreated, entityIdMap };
}

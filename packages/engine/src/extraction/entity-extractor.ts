import type { StorageAdapter } from '../adapters/storage.js';
import type { EmbeddingAdapter } from '../adapters/embedding.js';
import type { ExtractedEntity, ExtractedEdge } from './types.js';

export interface EntityPersistenceResult {
  entitiesCreated: number;
  edgesCreated: number;
  entityIdMap: Map<string, string>; // canonicalName → entity.id
}

/**
 * Persist extracted entities and edges to the database.
 * - Creates new entities if canonical name doesn't exist for this tenant
 * - Reuses existing entities if canonical name matches
 * - Links all entities to the fact via fact_entities junction
 * - Creates edges between entities
 */
export async function persistEntitiesAndEdges(
  storage: StorageAdapter,
  embedding: EmbeddingAdapter,
  tenantId: string,
  factId: string,
  entities: ExtractedEntity[],
  edges: ExtractedEdge[],
): Promise<EntityPersistenceResult> {
  const entityIdMap = new Map<string, string>();
  let entitiesCreated = 0;
  let edgesCreated = 0;

  // 1. Deduplicate entities by canonical name within this batch
  const uniqueEntities = new Map<string, ExtractedEntity>();
  for (const entity of entities) {
    if (!uniqueEntities.has(entity.canonicalName)) {
      uniqueEntities.set(entity.canonicalName, entity);
    }
  }

  // 2. Create or find each entity
  for (const entity of uniqueEntities.values()) {
    // Check if entity already exists in DB
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

    // 3. Link fact → entity
    const entityId = entityIdMap.get(entity.canonicalName)!;
    await storage.linkFactEntity(factId, entityId, 'mentioned');
  }

  // 4. Create edges between entities
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
    // (the entity might not have been extracted from this fact)
  }

  return { entitiesCreated, edgesCreated, entityIdMap };
}

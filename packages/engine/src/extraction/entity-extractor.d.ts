import type { StorageAdapter } from '../adapters/storage.js';
import type { EmbeddingAdapter } from '../adapters/embedding.js';
import type { ExtractedEntity, ExtractedEdge } from './types.js';
export interface EntityPersistenceResult {
    entitiesCreated: number;
    edgesCreated: number;
    entityIdMap: Map<string, string>;
}
/**
 * Create or find all entities in the database.
 * Does NOT link entities to any fact or create edges.
 * Returns a map of canonicalName → entity.id for use in subsequent operations.
 */
export declare function buildEntityIdMap(storage: StorageAdapter, embedding: EmbeddingAdapter, tenantId: string, entities: ExtractedEntity[]): Promise<{
    entityIdMap: Map<string, string>;
    entitiesCreated: number;
}>;
export declare function persistEdges(storage: StorageAdapter, tenantId: string, factId: string, edges: ExtractedEdge[], entityIdMap: Map<string, string>): Promise<number>;
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
export declare function persistEntitiesAndEdges(storage: StorageAdapter, embedding: EmbeddingAdapter, tenantId: string, factId: string, entities: ExtractedEntity[], edges: ExtractedEdge[]): Promise<EntityPersistenceResult>;
//# sourceMappingURL=entity-extractor.d.ts.map
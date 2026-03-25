/**
 * Create or find all entities in the database.
 * Does NOT link entities to any fact or create edges.
 * Returns a map of canonicalName → entity.id for use in subsequent operations.
 */
export async function buildEntityIdMap(storage, embedding, tenantId, entities) {
    const entityIdMap = new Map();
    let entitiesCreated = 0;
    // Deduplicate entities by canonical name within this batch
    const uniqueEntities = new Map();
    for (const entity of entities) {
        if (!uniqueEntities.has(entity.canonicalName)) {
            uniqueEntities.set(entity.canonicalName, entity);
        }
    }
    // Create or find each entity
    for (const entity of uniqueEntities.values()) {
        const existing = await storage.findEntityByCanonicalName(tenantId, entity.canonicalName, entity.entityType);
        if (existing) {
            entityIdMap.set(entity.canonicalName, existing.id);
        }
        else {
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
// Normalize relation names so "loves_deeply" and "loves" merge
const RELATION_SYNONYMS = {
    loves_deeply: 'loves',
    has_relationship: 'partner_of',
    has_relationship_with: 'partner_of',
    dating: 'partner_of',
    in_relationship_with: 'partner_of',
    romantic_partner: 'partner_of',
    girlfriend_of: 'partner_of',
    boyfriend_of: 'partner_of',
    married_to: 'partner_of',
    works_for: 'works_at',
    employed_at: 'works_at',
    employed_by: 'works_at',
    resides_in: 'lives_in',
    located_at: 'located_in',
    friends_with: 'friend_of',
    acquainted_with: 'knows',
    knows_about: 'knows',
    interested_in: 'prefers',
    attracted_to: 'prefers',
    likes: 'prefers',
};
function normalizeRelation(relation) {
    const lower = relation.toLowerCase().trim();
    return RELATION_SYNONYMS[lower] ?? lower;
}
export async function persistEdges(storage, tenantId, factId, edges, entityIdMap) {
    // Deduplicate edges by (source, target, normalized_relation) within this batch
    const seen = new Set();
    const dedupedEdges = [];
    for (const edge of edges) {
        const normalizedRelation = normalizeRelation(edge.relation);
        const key = `${edge.sourceName}|${normalizedRelation}|${edge.targetName}`;
        if (!seen.has(key)) {
            seen.add(key);
            dedupedEdges.push({ ...edge, relation: normalizedRelation });
        }
    }
    let edgesCreated = 0;
    for (const edge of dedupedEdges) {
        const sourceId = entityIdMap.get(edge.sourceName);
        const targetId = entityIdMap.get(edge.targetName);
        if (sourceId && targetId) {
            try {
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
            catch {
                // Edge creation failed (e.g., duplicate) — continue
            }
        }
        if (!sourceId || !targetId) {
            console.warn(`[steno] Edge dropped: "${edge.sourceName}" → "${edge.relation}" → "${edge.targetName}" ` +
                `(source=${sourceId ? 'found' : 'MISSING'}, target=${targetId ? 'found' : 'MISSING'}) ` +
                `entityMap keys: [${[...entityIdMap.keys()].join(', ')}]`);
        }
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
export async function persistEntitiesAndEdges(storage, embedding, tenantId, factId, entities, edges) {
    const { entityIdMap, entitiesCreated } = await buildEntityIdMap(storage, embedding, tenantId, entities);
    // Link all entities to this fact
    for (const [canonicalName, entityId] of entityIdMap) {
        void canonicalName; // used as key only
        await storage.linkFactEntity(factId, entityId, 'mentioned');
    }
    const edgesCreated = await persistEdges(storage, tenantId, factId, edges, entityIdMap);
    return { entitiesCreated, edgesCreated, entityIdMap };
}
//# sourceMappingURL=entity-extractor.js.map
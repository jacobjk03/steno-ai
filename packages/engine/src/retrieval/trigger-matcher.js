import { vectorSearch } from './vector-search.js';
export async function matchTriggers(storage, embedding, query, tenantId, scope, scopeId) {
    // 1. Get active triggers, sorted by priority descending
    const triggers = await storage.getActiveTriggers(tenantId, scope, scopeId);
    // triggers should already be sorted by priority DESC from storage
    const candidates = [];
    const triggersMatched = [];
    // 2. Evaluate each trigger
    for (const trigger of triggers) {
        const matches = await evaluateCondition(trigger.condition, query, {
            storage,
            embedding,
            tenantId,
            scope,
            scopeId,
        });
        if (matches) {
            triggersMatched.push(trigger.id);
            // Surface facts from factIds (batch fetch)
            if (trigger.factIds && trigger.factIds.length > 0) {
                const facts = await storage.getFactsByIds(tenantId, trigger.factIds);
                for (const fact of facts) {
                    if (fact.validUntil === null) {
                        candidates.push({
                            fact,
                            vectorScore: 0,
                            keywordScore: 0,
                            graphScore: 0,
                            recencyScore: 0,
                            salienceScore: 0,
                            temporalScore: 0,
                            source: 'trigger',
                            triggeredBy: trigger.id,
                        });
                    }
                }
            }
            // Surface facts for entityIds
            if (trigger.entityIds && trigger.entityIds.length > 0) {
                for (const entityId of trigger.entityIds) {
                    const result = await storage.getFactsForEntity(tenantId, entityId, { limit: 10 });
                    for (const fact of result.data) {
                        if (fact.validUntil === null) {
                            candidates.push({
                                fact,
                                vectorScore: 0,
                                keywordScore: 0,
                                graphScore: 0,
                                recencyScore: 0,
                                salienceScore: 0,
                                temporalScore: 0,
                                source: 'trigger',
                                triggeredBy: trigger.id,
                            });
                        }
                    }
                }
            }
            // Handle queryTemplate — run a vector sub-search with the template
            if (trigger.queryTemplate) {
                const templateResults = await vectorSearch(storage, embedding, trigger.queryTemplate, tenantId, scope, scopeId, 5);
                for (const c of templateResults) {
                    candidates.push({ ...c, source: 'trigger', triggeredBy: trigger.id });
                }
            }
            // Increment trigger fire count (fire and forget)
            void storage.incrementTriggerFired(tenantId, trigger.id).catch(() => { });
        }
    }
    return { candidates, triggersMatched };
}
/** Evaluate a trigger condition against query text */
export async function evaluateCondition(condition, query, context) {
    const lowerQuery = query.toLowerCase();
    // AND: all sub-conditions must match (checked first — if present, only AND logic applies)
    if (condition.AND && condition.AND.length > 0) {
        const results = await Promise.all(condition.AND.map((sub) => evaluateCondition(sub, query, context)));
        return results.every(Boolean);
    }
    // OR: any sub-condition must match (checked second — if present, only OR logic applies)
    if (condition.OR && condition.OR.length > 0) {
        const results = await Promise.all(condition.OR.map((sub) => evaluateCondition(sub, query, context)));
        return results.some(Boolean);
    }
    // topic_match: any topic word appears in query
    if (condition.topic_match && condition.topic_match.length > 0) {
        if (condition.topic_match.some((topic) => lowerQuery.includes(topic.toLowerCase()))) {
            return true;
        }
    }
    // keyword_any: any keyword appears in query
    if (condition.keyword_any && condition.keyword_any.length > 0) {
        if (condition.keyword_any.some((kw) => lowerQuery.includes(kw.toLowerCase()))) {
            return true;
        }
    }
    // entity_present: check if entities of given type(s) exist for this tenant
    // NOTE: entity_present currently checks tenant-wide, not scope-specific.
    // A scope-filtered version would require joining through fact_entities → facts.
    // This is acceptable for v1 but should be improved when per-scope entity queries are added.
    if (condition.entity_present && condition.entity_present.length > 0) {
        const entities = await context.storage.getEntitiesForTenant(context.tenantId, { limit: 100 });
        const hasMatchingEntity = entities.data.some((e) => condition.entity_present.some((type) => e.entityType.toLowerCase() === type.toLowerCase()));
        if (hasMatchingEntity)
            return true;
    }
    // semantic_similarity: embed both texts and compare
    if (condition.semantic_similarity) {
        const { text, threshold } = condition.semantic_similarity;
        const [queryEmb, condEmb] = await Promise.all([
            context.embedding.embed(query),
            context.embedding.embed(text),
        ]);
        const similarity = cosineSimilarity(queryEmb, condEmb);
        if (similarity >= threshold)
            return true;
    }
    return false;
}
export function cosineSimilarity(a, b) {
    if (a.length !== b.length || a.length === 0)
        return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}
//# sourceMappingURL=trigger-matcher.js.map
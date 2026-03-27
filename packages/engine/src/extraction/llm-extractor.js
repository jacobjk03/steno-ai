import { buildFactExtractionPrompt, buildGraphExtractionPrompt } from './prompts.js';
import { createEnrichedSegments } from './sliding-window.js';
/**
 * Two-pass extraction like Mem0:
 * Pass 1: Extract facts as simple strings (focused, high quality)
 * Pass 2: Extract entities + edges from the facts (separate concern)
 */
export async function extractWithLLM(config, input, existingFacts) {
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    // ── PASS 1: Fact extraction with Sliding Window Inference ──
    // For long inputs, split into overlapping segments so the LLM can resolve
    // pronouns and references using surrounding context (like Hydra DB).
    const segments = createEnrichedSegments(input);
    let factStrings = [];
    let factEntries = [];
    // Process segments (in parallel for speed, up to 4 at a time)
    const segmentBatches = [];
    for (let i = 0; i < segments.length; i += 4) {
        segmentBatches.push(segments.slice(i, i + 4));
    }
    for (const batch of segmentBatches) {
        const batchPromises = batch.map(async (seg) => {
            const factMessages = buildFactExtractionPrompt(seg.contextWindow);
            // Append existing facts for dedup context
            if (existingFacts && existingFacts.length > 0) {
                const factsBlock = existingFacts
                    .map(f => `- [lineage: ${f.lineageId}] ${f.content}`)
                    .join('\n');
                factMessages[1].content += `\n\n--- EXISTING FACTS (skip duplicates, mark updates) ---\n${factsBlock}`;
            }
            // Also append already-extracted facts from previous segments to avoid duplicates
            if (factEntries.length > 0) {
                const alreadyExtracted = factEntries.map(f => `- ${f.text}`).join('\n');
                factMessages[1].content += `\n\n--- ALREADY EXTRACTED (skip these) ---\n${alreadyExtracted}`;
            }
            try {
                const factResponse = await config.llm.complete(factMessages, { temperature: 0, responseFormat: 'json' });
                totalTokensIn += factResponse.tokensInput;
                totalTokensOut += factResponse.tokensOutput;
                const parsed = JSON.parse(factResponse.content);
                const rawFacts = Array.isArray(parsed.facts) ? parsed.facts : [];
                const entries = [];
                for (const f of rawFacts) {
                    if (typeof f === 'string') {
                        const trimmed = f.trim();
                        if (trimmed.length > 0)
                            entries.push({ text: trimmed, importance: 0.5, sourceChunk: seg.contextWindow, isPattern: false });
                    }
                    else if (f && typeof f === 'object') {
                        const obj = f;
                        const text = (typeof obj.t === 'string' ? obj.t : typeof obj.text === 'string' ? obj.text : '').trim();
                        const importance = typeof obj.i === 'number' ? obj.i : typeof obj.importance === 'number' ? obj.importance : 0.5;
                        const eventDate = obj.ed ? new Date(obj.ed) : undefined;
                        const documentDate = obj.dd ? new Date(obj.dd) : undefined;
                        const isPattern = obj.p === true;
                        if (text.length > 0)
                            entries.push({
                                text,
                                importance: Math.max(0, Math.min(1, importance)),
                                sourceChunk: seg.contextWindow,
                                eventDate: eventDate && !isNaN(eventDate.getTime()) ? eventDate : undefined,
                                documentDate: documentDate && !isNaN(documentDate.getTime()) ? documentDate : undefined,
                                isPattern,
                            });
                    }
                }
                return entries;
            }
            catch {
                return [];
            }
        });
        const batchResults = await Promise.all(batchPromises);
        for (const entries of batchResults) {
            factEntries.push(...entries);
        }
    }
    // Deduplicate facts by content similarity (simple string match)
    const seenContent = new Set();
    factEntries = factEntries.filter(e => {
        const key = e.text.toLowerCase().trim();
        if (seenContent.has(key))
            return false;
        seenContent.add(key);
        return true;
    });
    factStrings = factEntries.map(e => e.text);
    if (factEntries.length === 0) {
        return emptyResult(config.tier, config.llm.model);
    }
    if (factStrings.length === 0) {
        return emptyResult(config.tier, config.llm.model);
    }
    // Build ExtractedFact objects from parsed entries with LLM-scored importance
    const facts = factEntries.map(({ text, importance, sourceChunk, eventDate, documentDate, isPattern }) => ({
        content: text,
        importance,
        confidence: 0.8,
        sourceType: 'conversation',
        modality: 'text',
        tags: isPattern ? ['pattern'] : [],
        originalContent: input,
        entityCanonicalNames: [],
        sourceChunk,
        eventDate,
        documentDate,
    }));
    // ── Contextual memory wrappers ──
    // Prepend source context so the embedding captures the full meaning.
    // E.g. "User went to the gym" becomes "Context: <segment>... | Fact: User went to the gym"
    // This is a transient field — only used at embedding time, never stored.
    for (const fact of facts) {
        const src = fact.sourceChunk ?? input;
        const contextPrefix = src.length > 100
            ? `Context: ${src.slice(0, 200).trim()}... | Fact: `
            : `Context: ${src.trim()} | Fact: `;
        fact.contextualContent = contextPrefix + fact.content;
    }
    // ── PASS 2: Graph extraction (entities + edges) from the facts ──
    let entities = [];
    let edges = [];
    try {
        const graphMessages = buildGraphExtractionPrompt(factStrings, config.entityTypes, config.domainEntityTypes);
        const graphResponse = await config.llm.complete(graphMessages, { temperature: 0, responseFormat: 'json' });
        totalTokensIn += graphResponse.tokensInput;
        totalTokensOut += graphResponse.tokensOutput;
        const graphParsed = JSON.parse(graphResponse.content);
        // Parse entities
        const seenEntities = new Set();
        if (Array.isArray(graphParsed.entities)) {
            for (const e of graphParsed.entities) {
                if (!e || typeof e.name !== 'string')
                    continue;
                const entity = e;
                const canonical = normalizeEntityName(entity.name);
                if (canonical.length === 0 || seenEntities.has(canonical))
                    continue;
                seenEntities.add(canonical);
                // Capture properties from domain entity types (e.g., {"company_size": "enterprise"})
                const rawProps = entity.properties;
                const properties = (rawProps && typeof rawProps === 'object' && !Array.isArray(rawProps))
                    ? rawProps
                    : {};
                entities.push({
                    name: canonical.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                    entityType: String(entity.entity_type ?? entity.type ?? 'concept'),
                    canonicalName: canonical,
                    properties,
                });
            }
        }
        // Parse edges
        if (Array.isArray(graphParsed.edges)) {
            for (const r of graphParsed.edges) {
                if (!r)
                    continue;
                const rel = r;
                const rawSource = typeof rel.source === 'string' ? rel.source :
                    typeof rel.source_name === 'string' ? rel.source_name : null;
                const rawTarget = typeof rel.target === 'string' ? rel.target :
                    typeof rel.target_name === 'string' ? rel.target_name : null;
                if (!rawSource || !rawTarget)
                    continue;
                const source = normalizeEntityName(rawSource);
                const target = normalizeEntityName(rawTarget);
                if (!source || !target)
                    continue;
                edges.push({
                    sourceName: source,
                    targetName: target,
                    relation: String(rel.relation ?? 'related_to'),
                    edgeType: isValidEdgeType(rel.edge_type) ? rel.edge_type : 'associative',
                    confidence: 0.8,
                });
            }
        }
        // Link entities to facts by text match
        for (const fact of facts) {
            const contentLower = fact.content.toLowerCase();
            for (const entity of entities) {
                if (entity.canonicalName === 'user') {
                    if (contentLower.startsWith('user ') || contentLower.includes(' user ')) {
                        fact.entityCanonicalNames.push(entity.canonicalName);
                    }
                }
                else if (entity.canonicalName.length >= 3 && contentLower.includes(entity.canonicalName)) {
                    fact.entityCanonicalNames.push(entity.canonicalName);
                }
            }
        }
    }
    catch {
        // Graph pass failed — we still have facts, just no graph. That's OK.
    }
    return {
        facts,
        entities,
        edges,
        tier: config.tier,
        confidence: 0.8,
        tokensInput: totalTokensIn,
        tokensOutput: totalTokensOut,
        model: config.llm.model,
    };
}
function emptyResult(tier, model) {
    return {
        facts: [],
        entities: [],
        edges: [],
        tier,
        confidence: 0,
        tokensInput: 0,
        tokensOutput: 0,
        model,
    };
}
function isValidEdgeType(t) {
    return (typeof t === 'string' &&
        ['associative', 'causal', 'temporal', 'contradictory', 'hierarchical'].includes(t));
}
/**
 * Normalize an entity name to a clean canonical form.
 */
export function normalizeEntityName(raw) {
    let name = raw.trim();
    name = name.replace(/^[-–—*•#>]+\s*/g, '');
    name = name.replace(/'s$/i, '');
    name = name.replace(/\u2019s$/i, '');
    name = name.replace(/^[^a-zA-Z0-9]+/, '');
    name = name.replace(/[^a-zA-Z0-9]+$/, '');
    const leadingNoise = /^(the|a|an|when|where|how|what|why|who|is|are|was|were|has|have|had|my|our|their|his|her|its|this|that|these|those)\s+/i;
    name = name.replace(leadingNoise, '');
    name = name.replace(leadingNoise, '');
    name = name.replace(/\s+/g, ' ').trim();
    name = name.toLowerCase();
    return name;
}
//# sourceMappingURL=llm-extractor.js.map
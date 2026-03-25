import type { LLMAdapter } from '../adapters/llm.js';
import type { ExtractionResult, ExtractedFact, ExtractedEntity, ExtractedEdge } from './types.js';
import type { ExtractionTier, EdgeType } from '../config.js';
import { buildFactExtractionPrompt, buildGraphExtractionPrompt, buildExtractionPrompt } from './prompts.js';

export interface LLMExtractorConfig {
  llm: LLMAdapter;
  tier: ExtractionTier;
}

/**
 * Two-pass extraction like Mem0:
 * Pass 1: Extract facts as simple strings (focused, high quality)
 * Pass 2: Extract entities + edges from the facts (separate concern)
 */
export async function extractWithLLM(
  config: LLMExtractorConfig,
  input: string,
  existingFacts?: Array<{ lineageId: string; content: string }>,
): Promise<ExtractionResult> {
  let totalTokensIn = 0;
  let totalTokensOut = 0;

  // ── PASS 1: Fact extraction ──
  const factMessages = buildFactExtractionPrompt(input);

  // If existing facts provided, append them for dedup context
  if (existingFacts && existingFacts.length > 0) {
    const factsBlock = existingFacts
      .map(f => `- [lineage: ${f.lineageId}] ${f.content}`)
      .join('\n');
    factMessages[1]!.content += `\n\n--- EXISTING FACTS (skip duplicates, mark updates) ---\n${factsBlock}`;
  }

  let factStrings: string[] = [];
  let factEntries: Array<{ text: string; importance: number }> = [];
  try {
    const factResponse = await config.llm.complete(factMessages, { temperature: 0, responseFormat: 'json' });
    totalTokensIn += factResponse.tokensInput;
    totalTokensOut += factResponse.tokensOutput;

    const parsed = JSON.parse(factResponse.content) as Record<string, unknown>;
    const rawFacts = Array.isArray(parsed.facts) ? parsed.facts : [];
    for (const f of rawFacts) {
      if (typeof f === 'string') {
        const trimmed = f.trim();
        if (trimmed.length > 0) factEntries.push({ text: trimmed, importance: 0.5 });
      } else if (f && typeof f === 'object') {
        const obj = f as Record<string, unknown>;
        const text = (typeof obj.t === 'string' ? obj.t : typeof obj.text === 'string' ? obj.text : '').trim();
        const importance = typeof obj.i === 'number' ? obj.i : typeof obj.importance === 'number' ? obj.importance : 0.5;
        if (text.length > 0) factEntries.push({ text, importance: Math.max(0, Math.min(1, importance)) });
      }
    }
    factStrings = factEntries.map(e => e.text);
  } catch {
    return emptyResult(config.tier, config.llm.model);
  }

  if (factStrings.length === 0) {
    return emptyResult(config.tier, config.llm.model);
  }

  // Build ExtractedFact objects from parsed entries with LLM-scored importance
  const facts: ExtractedFact[] = factEntries.map(({ text, importance }) => ({
    content: text,
    importance,
    confidence: 0.8,
    sourceType: 'conversation' as const,
    modality: 'text' as const,
    tags: [],
    originalContent: input,
    entityCanonicalNames: [],
  }));

  // ── PASS 2: Graph extraction (entities + edges) from the facts ──
  let entities: ExtractedEntity[] = [];
  let edges: ExtractedEdge[] = [];

  try {
    const graphMessages = buildGraphExtractionPrompt(factStrings);
    const graphResponse = await config.llm.complete(graphMessages, { temperature: 0, responseFormat: 'json' });
    totalTokensIn += graphResponse.tokensInput;
    totalTokensOut += graphResponse.tokensOutput;

    const graphParsed = JSON.parse(graphResponse.content) as Record<string, unknown>;

    // Parse entities
    const seenEntities = new Set<string>();
    if (Array.isArray(graphParsed.entities)) {
      for (const e of graphParsed.entities as unknown[]) {
        if (!e || typeof (e as Record<string, unknown>).name !== 'string') continue;
        const entity = e as Record<string, unknown>;
        const canonical = normalizeEntityName(entity.name as string);
        if (canonical.length === 0 || seenEntities.has(canonical)) continue;
        seenEntities.add(canonical);
        entities.push({
          name: canonical.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          entityType: String(entity.entity_type ?? entity.type ?? 'concept'),
          canonicalName: canonical,
          properties: {},
        });
      }
    }

    // Parse edges
    if (Array.isArray(graphParsed.edges)) {
      for (const r of graphParsed.edges as unknown[]) {
        if (!r) continue;
        const rel = r as Record<string, unknown>;
        const rawSource = typeof rel.source === 'string' ? rel.source :
                         typeof rel.source_name === 'string' ? rel.source_name : null;
        const rawTarget = typeof rel.target === 'string' ? rel.target :
                         typeof rel.target_name === 'string' ? rel.target_name : null;
        if (!rawSource || !rawTarget) continue;
        const source = normalizeEntityName(rawSource);
        const target = normalizeEntityName(rawTarget);
        if (!source || !target) continue;
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
            fact.entityCanonicalNames!.push(entity.canonicalName);
          }
        } else if (entity.canonicalName.length >= 3 && contentLower.includes(entity.canonicalName)) {
          fact.entityCanonicalNames!.push(entity.canonicalName);
        }
      }
    }
  } catch {
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

function emptyResult(tier: ExtractionTier, model: string): ExtractionResult {
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

function isValidEdgeType(t: unknown): t is EdgeType {
  return (
    typeof t === 'string' &&
    ['associative', 'causal', 'temporal', 'contradictory', 'hierarchical'].includes(t)
  );
}

/**
 * Normalize an entity name to a clean canonical form.
 */
export function normalizeEntityName(raw: string): string {
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

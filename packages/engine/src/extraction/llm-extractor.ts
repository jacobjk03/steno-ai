import type { LLMAdapter } from '../adapters/llm.js';
import type { ExtractionResult, ExtractedFact, ExtractedEntity, ExtractedEdge } from './types.js';
import type { ExtractionTier, EdgeType } from '../config.js';
import { buildExtractionPrompt } from './prompts.js';

export interface LLMExtractorConfig {
  llm: LLMAdapter;
  tier: ExtractionTier; // 'cheap_llm' or 'smart_llm'
}

export async function extractWithLLM(
  config: LLMExtractorConfig,
  input: string,
  existingFacts?: Array<{ lineageId: string; content: string }>,
): Promise<ExtractionResult> {
  // 1. Build prompt — map camelCase lineageId to snake_case lineage_id for buildExtractionPrompt
  const mappedFacts = existingFacts?.map((f) => ({ lineage_id: f.lineageId, content: f.content }));
  const messages = buildExtractionPrompt(input, mappedFacts);

  // 2. Call LLM (catch API errors and return empty result)
  let response;
  try {
    response = await config.llm.complete(messages, { temperature: 0, responseFormat: 'json' });
  } catch {
    return emptyResult(config.tier, config.llm.model);
  }

  // 3. Parse JSON — retry once on failure
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(response.content) as Record<string, unknown>;
  } catch {
    // Retry once with slightly higher temperature so output differs
    try {
      response = await config.llm.complete(messages, { temperature: 0.1, responseFormat: 'json' });
      parsed = JSON.parse(response.content) as Record<string, unknown>;
    } catch {
      return emptyResult(config.tier, config.llm.model);
    }
  }

  // 4. Extract facts, entities, edges from parsed JSON
  const rawFacts = Array.isArray(parsed.facts) ? (parsed.facts as unknown[]) : [];
  const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.7;

  const facts: ExtractedFact[] = [];
  const entities: ExtractedEntity[] = [];
  const edges: ExtractedEdge[] = [];
  const seenEntities = new Set<string>();

  for (const f of rawFacts) {
    if (!f || typeof (f as Record<string, unknown>).content !== 'string') continue;
    const fact = f as Record<string, unknown>;
    const content = (fact.content as string).trim();
    if (content === '') continue;

    facts.push({
      content,
      importance: clamp(Number(fact.importance ?? 0.5), 0, 1),
      confidence: clamp(confidence, 0, 1),
      sourceType: 'conversation',
      modality: 'text',
      tags: Array.isArray(fact.tags) ? (fact.tags as unknown[]).filter((t): t is string => typeof t === 'string') : [],
      originalContent: input,
      operation: isValidOperation(fact.operation) ? (fact.operation as string).toLowerCase() as 'add' | 'update' | 'invalidate' | 'noop' | 'contradict' : undefined,
      existingLineageId:
        typeof fact.existing_lineage_id === 'string' ? fact.existing_lineage_id : undefined,
      contradictsFactId:
        typeof fact.contradicts_fact_id === 'string' ? fact.contradicts_fact_id : undefined,
      entityCanonicalNames: [] as string[], // populated below
    });

    const currentFact = facts[facts.length - 1]!;

    // Extract entities from this fact
    if (Array.isArray(fact.entities)) {
      for (const e of fact.entities as unknown[]) {
        if (!e || typeof (e as Record<string, unknown>).name !== 'string') continue;
        const entity = e as Record<string, unknown>;
        const canonical = (entity.name as string).toLowerCase().trim();
        if (!seenEntities.has(canonical)) {
          seenEntities.add(canonical);
          entities.push({
            name: String(entity.name),
            entityType: String(entity.type ?? 'concept'),
            canonicalName: canonical,
            properties: {},
          });
        }
        currentFact.entityCanonicalNames!.push(canonical);
      }
    }

    // Extract edges/relationships from this fact
    if (Array.isArray(fact.relationships)) {
      for (const r of fact.relationships as unknown[]) {
        if (!r) continue;
        const rel = r as Record<string, unknown>;
        if (typeof rel.source !== 'string' || typeof rel.target !== 'string') continue;
        edges.push({
          sourceName: rel.source.toLowerCase().trim(),
          targetName: rel.target.toLowerCase().trim(),
          relation: String(rel.relation ?? 'related_to'),
          edgeType: isValidEdgeType(rel.edge_type) ? rel.edge_type : 'associative',
          confidence: clamp(confidence, 0, 1),
        });
      }
    }
  }

  return {
    facts,
    entities,
    edges,
    tier: config.tier,
    confidence,
    tokensInput: response.tokensInput,
    tokensOutput: response.tokensOutput,
    model: response.model,
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

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function isValidOperation(
  op: unknown,
): op is 'add' | 'update' | 'invalidate' | 'noop' | 'contradict' {
  return (
    typeof op === 'string' &&
    ['add', 'update', 'invalidate', 'noop', 'contradict'].includes(op.toLowerCase())
  );
}

function isValidEdgeType(t: unknown): t is EdgeType {
  return (
    typeof t === 'string' &&
    ['associative', 'causal', 'temporal', 'contradictory', 'hierarchical'].includes(t)
  );
}

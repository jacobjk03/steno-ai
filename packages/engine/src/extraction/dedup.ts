import type { EmbeddingAdapter } from '../adapters/embedding.js';
import type { LLMAdapter, LLMMessage } from '../adapters/llm.js';
import type { StorageAdapter } from '../adapters/storage.js';
import type { ExtractedFact } from './types.js';

export interface DedupConfig {
  storage: StorageAdapter;
  embedding: EmbeddingAdapter;
  llm: LLMAdapter;
  similarityThreshold?: number; // default 0.85
}

export async function deduplicateFacts(
  config: DedupConfig,
  facts: ExtractedFact[],
  tenantId: string,
  scope: string,
  scopeId: string,
): Promise<ExtractedFact[]> {
  const threshold = config.similarityThreshold ?? 0.70;
  const result: ExtractedFact[] = [];

  for (const fact of facts) {
    // If LLM already decided and it's not 'add', trust it
    if (fact.operation && fact.operation !== 'add') {
      result.push(fact);
      continue;
    }

    // Embed the fact
    const embedding = await config.embedding.embed(fact.content);

    // Search for similar existing facts
    const matches = await config.storage.vectorSearch({
      embedding,
      tenantId,
      scope,
      scopeId,
      limit: 5,
      minSimilarity: threshold,
      validOnly: true,
    });

    if (matches.length === 0) {
      // No similar facts — this is new
      result.push({ ...fact, operation: 'add' });
      continue;
    }

    // Similar facts found — ask LLM to classify
    const decision = await classifyWithLLM(
      config.llm,
      fact.content,
      matches.map(m => ({
        id: m.fact.id,
        lineageId: m.fact.lineageId ?? '',
        content: m.fact.content,
        similarity: m.similarity,
      })),
    );

    result.push({ ...fact, ...decision });
  }

  return result;
}

async function classifyWithLLM(
  llm: LLMAdapter,
  candidateContent: string,
  existingMatches: Array<{ id: string; lineageId: string; content: string; similarity: number }>,
): Promise<Pick<ExtractedFact, 'operation' | 'existingLineageId' | 'contradictsFactId' | 'relationType' | 'relatedFactId'>> {
  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: `You are a memory deduplication classifier. Compare a NEW fact against EXISTING facts.

RULES:
- "noop" if the new fact says the SAME thing as an existing fact (even with different wording). Be AGGRESSIVE about noop — "User's name is Caroline" and "User is called Caroline" are NOOP.
- "update" if the new fact adds detail or changes a value ("User likes cats" → "User loves cats and has 3")
- "contradict" if the new fact directly conflicts ("User likes cats" vs "User hates cats")
- "add" ONLY if genuinely new information not covered by ANY existing fact

Return JSON:
{"operation": "add|update|noop|contradict", "existing_lineage_id": "...", "contradicts_fact_id": "..."}

Return ONLY valid JSON.`,
    },
    {
      role: 'user',
      content: `NEW FACT: "${candidateContent}"

EXISTING FACTS:
${existingMatches.map(m => `[id: ${m.id}, lineage_id: ${m.lineageId}, similarity: ${m.similarity.toFixed(3)}] ${m.content}`).join('\n')}

Classify the new fact.`,
    },
  ];

  try {
    const response = await llm.complete(messages, { temperature: 0, responseFormat: 'json' });
    const parsed = JSON.parse(response.content) as Record<string, unknown>;

    const operation = isValidDedupOp(parsed.operation) ? parsed.operation : 'add';

    return {
      operation,
      existingLineageId:
        typeof parsed.existing_lineage_id === 'string' ? parsed.existing_lineage_id : undefined,
      contradictsFactId:
        typeof parsed.contradicts_fact_id === 'string' ? parsed.contradicts_fact_id : undefined,
    };
  } catch {
    // If LLM fails, default to 'add' (safe — might create a duplicate, but won't lose data)
    return { operation: 'add' };
  }
}

function isValidDedupOp(op: unknown): op is 'add' | 'update' | 'noop' | 'contradict' | 'invalidate' {
  return typeof op === 'string' && ['add', 'update', 'noop', 'contradict', 'invalidate'].includes(op);
}

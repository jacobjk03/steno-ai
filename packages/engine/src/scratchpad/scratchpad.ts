import type { StorageAdapter } from '../adapters/storage.js';
import type { LLMAdapter } from '../adapters/llm.js';
import type { Scope } from '../config.js';

const SCRATCHPAD_MAX_CHARS = 5000;
const SCRATCHPAD_COMPRESSED_CHARS = 2500;

/**
 * Get or create a scratchpad for a scope.
 * The scratchpad is stored as a special fact with tag 'scratchpad'.
 */
export async function getScratchpad(
  storage: StorageAdapter,
  tenantId: string,
  scope: Scope,
  scopeId: string,
): Promise<string> {
  const facts = await storage.getFactsByScope(tenantId, scope, scopeId, { limit: 100 });
  const scratchpadFact = facts.data.find(f => f.tags?.includes('scratchpad'));
  return scratchpadFact?.content ?? '';
}

/**
 * Update the scratchpad after an extraction.
 * Appends new facts to the existing scratchpad, compresses if too long.
 */
export async function updateScratchpad(
  storage: StorageAdapter,
  llm: LLMAdapter,
  tenantId: string,
  scope: Scope,
  scopeId: string,
  newFacts: string[],
): Promise<void> {
  if (newFacts.length === 0) return;

  // Get existing scratchpad
  const existing = await getScratchpad(storage, tenantId, scope, scopeId);

  // Append new facts
  const newSection = newFacts.join('\n');
  let updated = existing ? `${existing}\n\n--- New information ---\n${newSection}` : newSection;

  // Compress if too long
  if (updated.length > SCRATCHPAD_MAX_CHARS) {
    updated = await compressScratchpad(llm, updated);
  }

  // Find existing scratchpad fact and invalidate it
  const facts = await storage.getFactsByScope(tenantId, scope, scopeId, { limit: 200 });
  const existingScratchpad = facts.data.find(f => f.tags?.includes('scratchpad'));

  if (existingScratchpad) {
    await storage.invalidateFact(tenantId, existingScratchpad.id);
  }

  // Create new scratchpad fact (no embedding needed — it's retrieved by tag, not vector search)
  const id = crypto.randomUUID();
  await storage.createFact({
    id,
    lineageId: existingScratchpad?.lineageId ?? crypto.randomUUID(),
    tenantId,
    scope,
    scopeId,
    content: updated,
    embeddingModel: 'none',
    embeddingDim: 1,
    importance: 1.0,
    confidence: 1.0,
    operation: existingScratchpad ? 'update' : 'create',
    sourceType: 'api',
    modality: 'text',
    tags: ['scratchpad'],
    metadata: { type: 'scratchpad', updatedAt: new Date().toISOString() },
    contradictionStatus: 'none',
  });
}

/**
 * Compress the scratchpad using an LLM.
 * Preserves the most important information while reducing size.
 */
export async function compressScratchpad(llm: LLMAdapter, content: string): Promise<string> {
  const response = await llm.complete([
    {
      role: 'system',
      content: `Compress the following user profile/scratchpad into a concise summary of ~${SCRATCHPAD_COMPRESSED_CHARS} characters.

Preserve:
- Names of people and their relationships
- Key facts (job, location, health, allergies)
- Strong preferences and personality traits
- Important events with dates
- Goals and future plans
- Contradictions or changes in opinion

Remove:
- Duplicate information
- Trivial details
- Repetitive emotional expressions

Output ONLY the compressed summary, no explanation.`
    },
    { role: 'user', content }
  ], { temperature: 0 });

  return response.content;
}

/**
 * Get filtered scratchpad content relevant to a query.
 */
export async function getRelevantScratchpad(
  storage: StorageAdapter,
  llm: LLMAdapter,
  tenantId: string,
  scope: Scope,
  scopeId: string,
  query: string,
): Promise<string> {
  const scratchpad = await getScratchpad(storage, tenantId, scope, scopeId);
  if (!scratchpad || scratchpad.length < 50) return '';

  // If scratchpad is short, return all of it
  if (scratchpad.length < 1000) return scratchpad;

  // Filter scratchpad for relevant content
  const response = await llm.complete([
    {
      role: 'system',
      content: 'Extract ONLY the parts of this user profile that are relevant to answering the given question. Return the relevant excerpts. If nothing is relevant, return empty string.'
    },
    {
      role: 'user',
      content: `Profile:\n${scratchpad}\n\nQuestion: ${query}`
    }
  ], { temperature: 0 });

  return response.content;
}

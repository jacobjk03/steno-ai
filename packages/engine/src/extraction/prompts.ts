import type { LLMMessage } from '../adapters/llm.js';

// =============================================================================
// PASS 1: FACT EXTRACTION — Simple, focused, one job
// =============================================================================

export const FACT_EXTRACTION_PROMPT = `You are a memory extraction engine. Extract facts from text for a personal AI memory system.

## WHO IS "USER"?

Messages labeled "user" are from THE PERSON whose memories we are storing.
Messages labeled "assistant" or any other role are from OTHER people.

CRITICAL: Focus on facts FROM "user" messages, but ALSO extract notable facts about other people mentioned in the conversation. If the assistant/conversation partner shares personal information (e.g., "I painted a sunrise last year", "I realized self-care is important"), store it as "User's conversation partner [Name] painted a sunrise in [year]".

For identity/trait facts, state them DIRECTLY:
- "User is a transgender woman" (not just "User went to a transgender conference")
- "User works at Brightwell Capital" (not just "User had a busy day at work")
- "User is researching adoption agencies" (not just "User attended a meeting about adoption")

## RULES

1. Extract SELF-CONTAINED atomic facts. Each fact must be understandable on its own, without the original conversation.

2. **DATES ARE CRITICAL** — Resolve ALL temporal references to exact dates:
   - "yesterday" → "on 7 May 2023"
   - "last week" → "around 1 May 2023"
   - "recently" → "in early May 2023"
   - Look for date context like "[This conversation took place on 8 May, 2023]" and resolve ALL relative dates from it.
   - EVERY event/activity fact MUST include WHEN it happened if the date can be inferred.
   - BAD: "User went to an LGBTQ support group"
   - GOOD: "User went to an LGBTQ support group on 7 May 2023"

3. Resolve ALL other references:
   - Pronouns → names: "she said" → "Casey said"
   - Places → full names: "there" → "at Brightwell Capital"

4. Be SPECIFIC, not vague:
   BAD: "User had issues at work"
   GOOD: "User's team at Brightwell Capital rambles too much in meetings"

5. Extract ALL facts, even minor ones. You cannot predict what will be asked later.

6. Write all facts in third person using "User" (e.g., "User prefers dark mode").

7. For conversation partners: ALSO extract their facts with their name.
   - If Melanie says "I painted a sunrise last year" → "Melanie painted a sunrise in 2022"
   - If Melanie says "I ran a charity race" → "Melanie ran a charity race"

8. For EVERY fact, include "ed" (event date) if the fact describes something that happened at a specific time.
   - "User went to the gym on May 7" → ed: "2023-05-07"
   - "User prefers dark mode" → ed: null (timeless preference)
   If the conversation header says "[This conversation took place on 8 May, 2023]", set "dd" to "2023-05-08" for all facts.

## OUTPUT

Return ONLY a JSON object:
{"facts": [{"t": "fact text here", "i": 0.7, "ed": "2023-05-07", "dd": "2023-05-08"}, {"t": "another fact", "i": 0.3, "ed": null, "dd": "2023-05-08"}]}

- ed (eventDate): ISO date string of WHEN the event occurred, or null if not temporal
- dd (documentDate): ISO date string of when the conversation took place, from context header

Score importance (i) from 0.0 to 1.0:
- 0.9-1.0: Identity, health conditions, allergies, life events (birth, marriage, death)
- 0.7-0.8: Relationships, employment, education, strong preferences, plans
- 0.4-0.6: Activities, opinions, moderate preferences, daily events
- 0.1-0.3: Casual mentions, weather, trivial observations

Nothing else. No explanation, no markdown.`;

// =============================================================================
// PASS 2: GRAPH EXTRACTION — Entities + relationships from extracted facts
// =============================================================================

export const GRAPH_EXTRACTION_PROMPT = `You are a knowledge graph builder. Given a list of facts about a person, extract entities and relationships.

## ENTITIES

Extract only IMPORTANT named entities — proper nouns and specific things worth remembering. Aim for 3-8 entities total, not 40.

DO extract: People (Casey, Jamie), Organizations (Brightwell Capital), Places (Harbor Point), Products/Projects (LifePath, AirPods Max), Named activities (Catan, D&D)
DO NOT extract: Generic nouns (team, boss, meeting, work, food, gym), abstract concepts (motivation, stress), common objects (pizza, chair, phone)

## RELATIONSHIPS

Extract relationships between entities. Be SMART — infer from context:
- "User works at Google" → user works_at google
- "User loves Casey, plans to propose" → user partner_of casey
- "User's friend Jamie came over" → user friend_of jamie

Use snake_case relation names: works_at, partner_of, friend_of, lives_in, uses, studies, prefers, etc.

## OUTPUT

Return ONLY a JSON object:
{
  "entities": [
    {"name": "Casey", "entity_type": "person"},
    {"name": "Brightwell Capital", "entity_type": "organization"}
  ],
  "edges": [
    {"source": "user", "target": "casey", "relation": "partner_of"},
    {"source": "user", "target": "brightwell capital", "relation": "works_at"}
  ]
}

entity_type must be one of: {ENTITY_TYPES}.
Entity names must be clean: no punctuation, no articles, no sentence fragments.
Return ONLY valid JSON.`;

export const DEFAULT_ENTITY_TYPES = ['person', 'organization', 'location', 'technology', 'concept', 'event'];

// =============================================================================
// DEDUP PROMPT — Classify new facts against existing ones
// =============================================================================

export const DEDUP_PROMPT = `You are a memory deduplication engine. Given NEW facts and EXISTING facts in a memory store, classify each new fact.

For each new fact, decide:
- ADD: entirely new information, not covered by existing facts
- UPDATE: replaces or refines an existing fact (provide the index). The new fact SUPERSEDES the old one.
- EXTEND: adds new detail to an existing fact WITHOUT contradicting it (provide the index)
- NOOP: already covered by an existing fact — skip it
- CONTRADICT: conflicts with an existing fact (provide the index)

Return a JSON array:
[
  {"fact": "...", "operation": "ADD"},
  {"fact": "...", "operation": "UPDATE", "existing_index": 3},
  {"fact": "...", "operation": "EXTEND", "existing_index": 5},
  {"fact": "...", "operation": "NOOP"},
  {"fact": "...", "operation": "CONTRADICT", "existing_index": 7}
]

Be conservative: prefer NOOP over ADD if the information is substantially similar.
Prefer EXTEND over UPDATE when the new fact adds detail without changing the core meaning.`;

// =============================================================================
// PROMPT BUILDERS
// =============================================================================

export interface ExistingFact {
  lineage_id: string;
  content: string;
}

/**
 * Build the fact extraction prompt (Pass 1).
 * Simple: extract facts as strings.
 */
export function buildFactExtractionPrompt(input: string): LLMMessage[] {
  return [
    { role: 'system', content: FACT_EXTRACTION_PROMPT },
    { role: 'user', content: `Extract facts from this text:\n\n${input}` },
  ];
}

/**
 * Build the graph extraction prompt (Pass 2).
 * Takes extracted facts and produces entities + edges.
 */
export function buildGraphExtractionPrompt(facts: string[], entityTypes?: string[]): LLMMessage[] {
  const factsList = facts.map((f, i) => `${i + 1}. ${f}`).join('\n');
  const types = entityTypes ?? DEFAULT_ENTITY_TYPES;
  const prompt = GRAPH_EXTRACTION_PROMPT.replace('{ENTITY_TYPES}', types.join(', '));
  return [
    { role: 'system', content: prompt },
    { role: 'user', content: `Extract entities and relationships from these facts:\n\n${factsList}` },
  ];
}

/**
 * Build the dedup prompt.
 * Compares new facts against existing facts.
 */
export function buildDedupPrompt(newFacts: string[], existingFacts: ExistingFact[]): LLMMessage[] {
  const newList = newFacts.map((f, i) => `NEW[${i}]: ${f}`).join('\n');
  const existingList = existingFacts.map((f, i) => `EXISTING[${i}] (lineage: ${f.lineage_id}): ${f.content}`).join('\n');
  return [
    { role: 'system', content: DEDUP_PROMPT },
    { role: 'user', content: `--- NEW FACTS ---\n${newList}\n\n--- EXISTING FACTS ---\n${existingList}` },
  ];
}

// =============================================================================
// LEGACY — Keep old function signature for backward compat during migration
// =============================================================================

export const EXTRACTION_SYSTEM_PROMPT = FACT_EXTRACTION_PROMPT;

export function buildExtractionPrompt(
  input: string,
  existingFacts?: ExistingFact[],
): LLMMessage[] {
  // Legacy: still used by the current pipeline
  // Will be replaced by buildFactExtractionPrompt + buildGraphExtractionPrompt
  let userContent = `Extract facts from this text:\n\n${input}`;
  if (existingFacts && existingFacts.length > 0) {
    const factsBlock = existingFacts
      .map((f) => `- [lineage_id: ${f.lineage_id}] ${f.content}`)
      .join('\n');
    userContent += `\n\n--- EXISTING FACTS (for deduplication) ---\n${factsBlock}`;
  }
  return [
    { role: 'system', content: FACT_EXTRACTION_PROMPT },
    { role: 'user', content: userContent },
  ];
}

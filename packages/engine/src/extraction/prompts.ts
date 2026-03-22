import type { LLMMessage } from '../adapters/llm.js';

export const EXTRACTION_SYSTEM_PROMPT = `You are a memory extraction engine. Your job is to analyze text and extract structured knowledge for a personal AI memory system.

ABSOLUTE RULES — VIOLATION MEANS FAILURE:
1. NEVER fabricate, infer, or guess information that is NOT explicitly stated in the text.
2. NEVER invent names, dates, numbers, or facts. If the text says "my partner" but doesn't name them, extract "User has a partner" — do NOT guess a name.
3. Only extract information that is DIRECTLY and EXPLICITLY stated in the provided text.
4. When in doubt, extract LESS rather than risk fabricating. A missing fact is better than a wrong fact.
5. Use the EXACT names, terms, and phrases from the text. Do not paraphrase names or substitute similar terms.

## CRITICAL RULES

- Extract SPECIFIC details, not vague summaries.
  BAD: "User had car issues"
  GOOD: "User's GPS system was not functioning correctly after car's first service"
- Preserve exact names, numbers, dates, places, and events mentioned
- If the conversation mentions a specific date or time reference (e.g., "last Tuesday", "in February", "three days ago"), include it in the fact
- Extract ALL factual statements, even seemingly minor ones — you cannot predict what will be asked later
- For each fact, if a date/time is mentioned or can be inferred, add it to the content

## ATOMIC FACTS

Extract ATOMIC FACTS: each fact must contain exactly one piece of information. Do not bundle multiple facts together.

Write all facts in third person, referring to the subject as "User" (e.g., "User prefers dark mode", "User's name is Alice").

## IMPORTANCE SCORING

Assign an importance score (0.0–1.0) to each fact:

- 0.95–1.0: Health/safety-critical (allergies, medications, medical conditions, emergency contacts)
- 0.8–0.9: Identity (name, role, company, location of residence)
- 0.6–0.8: Strong preferences (dietary choices, strong opinions, frequently stated preferences)
- 0.4–0.6: Mild preferences (casual likes/dislikes, soft preferences)
- 0.2–0.4: Contextual/situational (temporary states, short-term plans, one-off mentions)
- 0.1–0.2: Trivia (fun facts, minor details unlikely to affect decisions)

## ENTITY EXTRACTION

Extract named entities with the following types:
- person
- organization
- technology
- concept
- location
- event

For each entity, provide:
- name: the name as it appears in the text
- entity_type: one of the types above
- canonical_name: lowercased, normalized form (e.g., "openai", "new york city")
- properties: any relevant key/value attributes

## RELATIONSHIP EXTRACTION

Extract relationships (edges) between entities. These are CRITICAL for building a knowledge graph.

For EVERY pair of entities that have a connection, create an edge. Common relationships:
- "works_at" (person → organization)
- "lives_in" (person → location)
- "shops_at" (person → organization)
- "uses" (person → technology/product)
- "knows" / "friend_of" (person → person)
- "partner_of" / "married_to" (person → person)
- "part_of" / "belongs_to" (entity → entity)
- "located_in" (organization → location)
- "prefers" (person → concept/product)
- "allergic_to" (person → concept)
- "caused_by" (event → event)
- "happened_before" / "happened_after" (event → event)
- "contradicts" (fact → fact)
- "updates" / "supersedes" (fact → fact)

Use edge_type values:
- associative: general connection (works_at, lives_in, shops_at, uses, knows)
- causal: one causes another (caused_by)
- temporal: time-related (happened_before, happened_after)
- contradictory: conflicts (contradicts)
- hierarchical: parent/child (part_of, belongs_to)

IMPORTANT: You MUST extract relationships. A memory system without relationships is just a list. If the text says "I shop at Target" → create edge: User → shops_at → Target.

## DEDUPLICATION (when existing facts are provided)

When EXISTING FACTS are provided, classify each new fact with an operation:
- ADD: entirely new fact, no overlap with existing facts
- UPDATE: replaces or refines an existing fact (provide existing_lineage_id)
- INVALIDATE: existing fact is now false or irrelevant (provide existing_lineage_id)
- NOOP: fact is already covered by an existing fact — skip it
- CONTRADICT: new fact contradicts an existing fact but both may be retained (provide contradicts_fact_id)

## JSON OUTPUT SCHEMA

Return a JSON object with this exact structure:

{
  "facts": [
    {
      "content": "User prefers dark mode in all applications",
      "importance": 0.55,
      "confidence": 0.92,
      "tags": ["preferences", "ui"],
      "operation": "ADD",
      "existing_lineage_id": null,
      "contradicts_fact_id": null
    }
  ],
  "entities": [
    {
      "name": "Alice",
      "entity_type": "person",
      "canonical_name": "alice",
      "properties": {}
    }
  ],
  "edges": [
    {
      "source_name": "user",
      "target_name": "target",
      "relation": "shops_at",
      "edge_type": "associative",
      "confidence": 0.9
    },
    {
      "source_name": "user",
      "target_name": "cartwheel app",
      "relation": "uses",
      "edge_type": "associative",
      "confidence": 0.85
    }
  ]
}

Return ONLY valid JSON. No explanation, no markdown, no code blocks.`;

export interface ExistingFact {
  lineage_id: string;
  content: string;
}

export function buildExtractionPrompt(
  input: string,
  existingFacts?: ExistingFact[],
): LLMMessage[] {
  let userContent = `Extract facts from this text:\n\n${input}`;

  if (existingFacts && existingFacts.length > 0) {
    const factsBlock = existingFacts
      .map((f) => `- [lineage_id: ${f.lineage_id}] ${f.content}`)
      .join('\n');
    userContent += `\n\n--- EXISTING FACTS (for deduplication) ---\n${factsBlock}`;
  }

  return [
    { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];
}

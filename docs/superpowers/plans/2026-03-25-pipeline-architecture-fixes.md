# Pipeline Architecture Fixes — Closing the Gap with Supermemory SOTA

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five architectural weaknesses in Steno's extraction and retrieval pipeline that cause failures on temporal reasoning, knowledge updates, and context loss.

**Architecture:** Store source chunks alongside atomic facts for context injection during retrieval. Add relational versioning edges (`updates`/`extends`/`derives`) to track knowledge evolution. Add a temporal retrieval signal using `eventDate`/`documentDate`. Lower sliding window threshold so contextual resolution fires on normal conversations. Process conversations session-by-session instead of segment-by-segment.

**Tech Stack:** TypeScript, Zod, better-sqlite3, Supabase (PostgreSQL), bun test

---

## File Structure

### New Files
- `packages/engine/src/retrieval/temporal-scorer.ts` — 6th retrieval signal: scores facts by `eventDate` proximity to query time references
- `packages/engine/tests/retrieval/temporal-scorer.test.ts` — Tests for temporal scoring

### Modified Files
- `packages/engine/src/config.ts` — Add `updates`, `extends`, `derives` edge types
- `packages/engine/src/extraction/sliding-window.ts:37-43` — Lower `minInputLength` from 8000 to 2000
- `packages/engine/src/extraction/prompts.ts:7-61` — Add `sourceChunk` to fact output format; add relational classification instructions
- `packages/engine/src/extraction/types.ts:15-28` — Add `sourceChunk` field to `ExtractedFact`
- `packages/engine/src/extraction/llm-extractor.ts` — Capture source chunk per segment; parse relational edges from extraction
- `packages/engine/src/extraction/pipeline.ts:252-277` — Pass `sourceChunk` when creating facts; handle relational edge creation
- `packages/engine/src/models/fact.ts` — Add `sourceChunk` field to Fact schema and CreateFact schema
- `packages/engine/src/retrieval/types.ts` — Add `temporalScore` to Candidate/FusionWeights/SearchResult signals; add `sourceChunk` to SearchResult
- `packages/engine/src/retrieval/fusion.ts` — Include `temporalScore` in weighted fusion
- `packages/engine/src/retrieval/search.ts` — Call temporal scorer; include `sourceChunk` in results
- `packages/engine/src/adapters/storage.ts` — Add `sourceChunk` to `createFact` params
- `packages/sqlite-adapter/src/schema.ts` — Add `source_chunk` column to facts table
- `packages/sqlite-adapter/src/storage.ts` — Persist and retrieve `sourceChunk`
- `packages/engine/tests/extraction/sliding-window.test.ts` — Update threshold expectations
- `packages/engine/tests/retrieval/fusion.test.ts` — Update for 6-signal fusion
- `packages/engine/tests/retrieval/search.test.ts` — Update for temporal signal + sourceChunk

---

### Task 1: Lower Sliding Window Threshold

The simplest and highest-impact fix. Currently set to 8000 chars, which means most real conversations (3-5k chars) are processed as a single segment without contextual windowing. This disables pronoun resolution and temporal reference grounding.

**Files:**
- Modify: `packages/engine/src/extraction/sliding-window.ts:37-43`
- Test: `packages/engine/tests/extraction/sliding-window.test.ts` (existing)

- [ ] **Step 1: Read the existing sliding window tests**

```bash
cat packages/engine/tests/extraction/sliding-window.test.ts
```

Understand what the current tests assert about the threshold.

- [ ] **Step 2: Update the threshold constant**

In `packages/engine/src/extraction/sliding-window.ts`, change:

```typescript
const DEFAULT_CONFIG: Required<WindowConfig> = {
  segmentSize: 800,
  hPrev: 2,
  hNext: 1,
  minInputLength: 8000, // Only window very long inputs — short/medium go through as single pass
  maxSegments: 4,       // Cap at 4 segments to limit LLM costs
};
```

To:

```typescript
const DEFAULT_CONFIG: Required<WindowConfig> = {
  segmentSize: 800,
  hPrev: 2,
  hNext: 1,
  minInputLength: 3500, // Window multi-turn conversations for pronoun/temporal resolution
  maxSegments: 6,       // Allow more segments for better coverage
};
```

- [ ] **Step 3: Update any tests that hardcode the old threshold**

If tests assert single-segment output for inputs between 2000-8000 chars, update expectations to expect multiple segments.

- [ ] **Step 4: Run tests**

```bash
cd packages/engine && bun test tests/extraction/sliding-window.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/extraction/sliding-window.ts packages/engine/tests/extraction/sliding-window.test.ts
git commit -m "perf: lower sliding window threshold to 2000 chars for better context resolution"
```

---

### Task 2: Add `sourceChunk` Field to Fact Model

Store the original conversation chunk that produced each fact, so retrieval can inject it for the answer model. This is the "search on atomic facts, answer with full context" pattern from Supermemory.

**Files:**
- Modify: `packages/engine/src/models/fact.ts:12-49`
- Modify: `packages/engine/src/models/fact.ts:53-76` (CreateFactSchema)
- Modify: `packages/engine/src/adapters/storage.ts:99`
- Modify: `packages/sqlite-adapter/src/schema.ts:41-74`
- Test: `packages/engine/tests/models/fact.test.ts`

- [ ] **Step 1: Read the Fact model test**

```bash
cat packages/engine/tests/models/fact.test.ts
```

- [ ] **Step 2: Write a failing test for sourceChunk**

Add to `packages/engine/tests/models/fact.test.ts`:

```typescript
it('should accept sourceChunk as optional field', () => {
  const fact = FactSchema.parse({
    // ... existing valid fact fields from other tests ...
    sourceChunk: 'user: I went to the gym yesterday\nassistant: That sounds great!',
  });
  expect(fact.sourceChunk).toBe('user: I went to the gym yesterday\nassistant: That sounds great!');
});

it('should default sourceChunk to null', () => {
  const fact = FactSchema.parse({
    // ... existing valid fact fields without sourceChunk ...
  });
  expect(fact.sourceChunk).toBeNull();
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd packages/engine && bun test tests/models/fact.test.ts -t "sourceChunk"
```

Expected: FAIL — `sourceChunk` not in schema

- [ ] **Step 4: Add `sourceChunk` to FactSchema**

In `packages/engine/src/models/fact.ts`, add after `documentDate` (line ~47):

```typescript
/** The original conversation chunk this fact was extracted from */
sourceChunk: z.string().max(10000).nullable().optional().default(null),
```

- [ ] **Step 5: Add `sourceChunk` to CreateFactSchema**

In `packages/engine/src/models/fact.ts`, add to CreateFactSchema:

```typescript
sourceChunk: z.string().max(10000).optional(),
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd packages/engine && bun test tests/models/fact.test.ts
```

Expected: PASS

- [ ] **Step 7: Add `source_chunk` column to SQLite schema**

In `packages/sqlite-adapter/src/schema.ts`, add after line 72 (`document_date TEXT,`):

```sql
source_chunk TEXT,
```

- [ ] **Step 8: Update StorageAdapter `createFact` signature**

In `packages/engine/src/adapters/storage.ts`, the `createFact` method already accepts `CreateFact & { id, lineageId, ... }`. Since we added `sourceChunk` to `CreateFactSchema`, it will flow through automatically. No changes needed here.

- [ ] **Step 9: Update SQLite adapter to persist sourceChunk**

Read `packages/sqlite-adapter/src/storage.ts` and find the `createFact` implementation. Add `source_chunk` to the INSERT statement and the SELECT queries for `getFact`, `getFactsByIds`, etc.

The exact changes depend on the current code — read the file, find every place facts are read/written, and add the `source_chunk` column.

- [ ] **Step 10: Run all engine tests**

```bash
cd packages/engine && bun test
```

Expected: PASS (all existing tests should still pass)

- [ ] **Step 11: Commit**

```bash
git add packages/engine/src/models/fact.ts packages/engine/tests/models/fact.test.ts packages/sqlite-adapter/src/schema.ts packages/sqlite-adapter/src/storage.ts packages/engine/src/adapters/storage.ts
git commit -m "feat: add sourceChunk field to Fact model for context injection during retrieval"
```

---

### Task 3: Capture Source Chunks During Extraction

Wire up the extraction pipeline to store the conversation segment that produced each fact. Each fact gets the `contextWindow` from its enriched segment as its `sourceChunk`.

**Files:**
- Modify: `packages/engine/src/extraction/types.ts:15-28`
- Modify: `packages/engine/src/extraction/llm-extractor.ts:25-104`
- Modify: `packages/engine/src/extraction/pipeline.ts:252-277`

- [ ] **Step 1: Add `sourceChunk` to ExtractedFact type**

In `packages/engine/src/extraction/types.ts`, add to `ExtractedFact` interface (after `entityCanonicalNames`):

```typescript
/** The conversation segment this fact was extracted from */
sourceChunk?: string;
```

- [ ] **Step 2: Pass segment context to extracted facts in llm-extractor.ts**

Read `packages/engine/src/extraction/llm-extractor.ts` fully. In the Pass 1 loop (lines ~25-104), each segment produces facts. After parsing the LLM response for a segment, tag each fact with the segment's context:

Find the section where facts are collected per-segment (after JSON parsing) and add:

```typescript
// Tag each fact with its source segment for context injection at retrieval time
for (const f of segmentFacts) {
  f.sourceChunk = segment.contextWindow;
}
```

Where `segment` is the current `EnrichedSegment` being processed.

For inputs that don't go through windowing (single segment), use the full input text as the sourceChunk.

- [ ] **Step 3: Pass `sourceChunk` through to `createFact` in pipeline.ts**

In `packages/engine/src/extraction/pipeline.ts`, find the `createFact` call (~line 252-277). Add `sourceChunk`:

```typescript
await config.storage.createFact({
  // ... existing fields ...
  sourceChunk: fact.sourceChunk,
});
```

- [ ] **Step 4: Run extraction tests**

```bash
cd packages/engine && bun test tests/extraction/
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/extraction/types.ts packages/engine/src/extraction/llm-extractor.ts packages/engine/src/extraction/pipeline.ts
git commit -m "feat: capture source chunks during extraction for context injection"
```

---

### Task 4: Add Relational Edge Types (`updates`, `extends`, `derives`)

Add three new edge types for knowledge chain tracking. When the LLM detects that a new fact updates, extends, or derives from an existing one, it creates an explicit edge.

**Files:**
- Modify: `packages/engine/src/config.ts:57-64`
- Modify: `packages/engine/src/extraction/prompts.ts:107-123` (DEDUP_PROMPT)
- Modify: `packages/engine/src/extraction/entity-extractor.ts:67-88` (RELATION_SYNONYMS)
- Test: `packages/engine/tests/models/edge.test.ts`

- [ ] **Step 1: Read current edge test**

```bash
cat packages/engine/tests/models/edge.test.ts
```

- [ ] **Step 2: Write failing test for new edge types**

Add test cases that validate `updates`, `extends`, `derives` are accepted as valid `edgeType` values:

```typescript
it('should accept relational versioning edge types', () => {
  for (const edgeType of ['updates', 'extends', 'derives']) {
    const edge = EdgeSchema.parse({
      // ... minimal valid edge with edgeType set to each new type ...
    });
    expect(edge.edgeType).toBe(edgeType);
  }
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd packages/engine && bun test tests/models/edge.test.ts -t "relational versioning"
```

Expected: FAIL — `updates` not in enum

- [ ] **Step 4: Add new edge types to config.ts**

In `packages/engine/src/config.ts`, change line 57-63:

```typescript
export const EDGE_TYPES = [
  'associative',
  'causal',
  'temporal',
  'contradictory',
  'hierarchical',
  'updates',    // new fact supersedes old one (knowledge chain)
  'extends',    // new fact adds detail to old one
  'derives',    // new fact is inferred from combining others
] as const;
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd packages/engine && bun test tests/models/edge.test.ts
```

Expected: PASS

- [ ] **Step 6: Add relational synonyms for new edge types**

In `packages/engine/src/extraction/entity-extractor.ts`, add to `RELATION_SYNONYMS`:

```typescript
replaces: 'updates',
supersedes: 'updates',
overrides: 'updates',
corrects: 'updates',
supplements: 'extends',
refines: 'extends',
elaborates: 'extends',
details: 'extends',
infers: 'derives',
implies: 'derives',
combines: 'derives',
```

- [ ] **Step 7: Update DEDUP_PROMPT to output relational edges**

In `packages/engine/src/extraction/prompts.ts`, update `DEDUP_PROMPT` (line 107) to also request the relationship type in the output:

```typescript
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
```

- [ ] **Step 8: Run all engine tests**

```bash
cd packages/engine && bun test
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add packages/engine/src/config.ts packages/engine/src/extraction/prompts.ts packages/engine/src/extraction/entity-extractor.ts packages/engine/tests/models/edge.test.ts
git commit -m "feat: add updates/extends/derives edge types for relational versioning"
```

---

### Task 5: Create Relational Edges During Pipeline Execution

When the dedup phase identifies UPDATE/EXTEND/CONTRADICT relationships, create explicit edges between the new and old facts so retrieval can follow knowledge chains.

**Files:**
- Modify: `packages/engine/src/extraction/dedup.ts`
- Modify: `packages/engine/src/extraction/pipeline.ts:172-186`
- Modify: `packages/engine/src/extraction/types.ts:15-28`

- [ ] **Step 1: Read the dedup module**

```bash
cat packages/engine/src/extraction/dedup.ts
```

Understand how it currently returns results and what information is available about existing facts.

- [ ] **Step 2: Add `relationType` field to ExtractedFact**

In `packages/engine/src/extraction/types.ts`, add to `ExtractedFact`:

```typescript
/** If this fact relates to an existing one: 'updates' | 'extends' | 'derives' */
relationType?: 'updates' | 'extends' | 'derives';
/** The ID of the existing fact this relates to (set by dedup) */
relatedFactId?: string;
```

- [ ] **Step 3: Update dedup to pass through EXTEND operations and capture relation info**

In the dedup module, when the LLM returns `EXTEND`, set `fact.operation = 'add'` (it's new information) but also set `fact.relationType = 'extends'` and `fact.relatedFactId = existingFact.id`. For `UPDATE`, set `fact.relationType = 'updates'`.

- [ ] **Step 4: Create relational edges in pipeline.ts**

After facts are persisted (after the fact creation loop, around line 317), add:

```typescript
// Create relational versioning edges for facts that update/extend existing ones
for (const { fact } of contradictionResults) {
  if (fact.relationType && fact.relatedFactId) {
    // Find the entities linked to both facts to create an edge between them
    // For now, create a direct fact-to-fact relationship stored in edge metadata
    const factId = /* the persisted fact ID for this extracted fact */;
    // We need to track factIds as we create them — add a Map<ExtractedFact, string>
  }
}
```

**Important:** We need to track the mapping from ExtractedFact to persisted fact ID. Add a `Map` before the fact creation loop:

```typescript
const persistedFactIds = new Map<string, string>(); // fact.content -> factId
```

Then after creating each fact, record it:

```typescript
persistedFactIds.set(fact.content, factId);
```

Then after the loop, create edges:

```typescript
for (const { fact } of contradictionResults) {
  if (fact.operation === 'noop') continue;
  if (fact.relationType && fact.relatedFactId) {
    const newFactId = persistedFactIds.get(fact.content);
    if (newFactId) {
      await config.storage.createEdge({
        id: crypto.randomUUID(),
        tenantId: input.tenantId,
        sourceId: /* need entity IDs, not fact IDs — see note below */,
        targetId: ...,
        relation: fact.relationType,
        edgeType: fact.relationType,
        weight: 1.0,
        factId: newFactId,
        confidence: 0.9,
        metadata: { relatedFactId: fact.relatedFactId },
      });
    }
  }
}
```

**NOTE:** The current edge schema requires `sourceId`/`targetId` to be entity IDs (not fact IDs). Two options:
1. Use the "User" entity as source and the most relevant entity from the fact as target
2. Store the relationship in fact `metadata` instead of as an edge (simpler, no schema change)

**Recommendation:** Store in fact `metadata` for now. During retrieval, when a fact has `metadata.relatedFactId`, fetch the related fact and include it in results. This avoids changing the edge schema.

Update the `createFact` call to include relation metadata:

```typescript
metadata: {
  ...(fact.relationType && { relationType: fact.relationType }),
  ...(fact.relatedFactId && { relatedFactId: fact.relatedFactId }),
},
```

- [ ] **Step 5: Run tests**

```bash
cd packages/engine && bun test
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/extraction/dedup.ts packages/engine/src/extraction/pipeline.ts packages/engine/src/extraction/types.ts
git commit -m "feat: create relational versioning links during dedup phase"
```

---

### Task 6: Add Temporal Retrieval Signal

Create a 6th retrieval signal that scores facts by `eventDate` proximity to the query's time reference. This enables "which happened first?" and "what did I do in February?" queries.

**Files:**
- Create: `packages/engine/src/retrieval/temporal-scorer.ts`
- Create: `packages/engine/tests/retrieval/temporal-scorer.test.ts`
- Modify: `packages/engine/src/retrieval/types.ts:19-25` (FusionWeights)
- Modify: `packages/engine/src/retrieval/types.ts:28-48` (SearchResult signals)
- Modify: `packages/engine/src/retrieval/types.ts:60-68` (Candidate)
- Modify: `packages/engine/src/retrieval/types.ts:71-77` (DEFAULT_FUSION_WEIGHTS)
- Modify: `packages/engine/src/retrieval/fusion.ts`
- Modify: `packages/engine/src/retrieval/search.ts`
- Modify: `packages/engine/src/config.ts:13-21` (retrievalWeights)

- [ ] **Step 1: Write failing test for temporal scorer**

Create `packages/engine/tests/retrieval/temporal-scorer.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';
import { scoreTemporalRelevance, extractTimeReference } from '../../src/retrieval/temporal-scorer.js';
import type { Candidate } from '../../src/retrieval/types.js';

describe('extractTimeReference', () => {
  it('should extract explicit dates from queries', () => {
    expect(extractTimeReference('What did I do on March 15th?')).toEqual(
      expect.objectContaining({ month: 2, day: 15 }) // 0-indexed month
    );
  });

  it('should extract month references', () => {
    expect(extractTimeReference('What happened in February?')).toEqual(
      expect.objectContaining({ month: 1 })
    );
  });

  it('should extract relative time references', () => {
    const ref = extractTimeReference('What did I do last week?');
    expect(ref).not.toBeNull();
  });

  it('should return null for non-temporal queries', () => {
    expect(extractTimeReference('What is my favorite color?')).toBeNull();
  });

  it('should extract "first" / "last" ordering intent', () => {
    const ref = extractTimeReference('Which event did I attend first?');
    expect(ref).toEqual(expect.objectContaining({ ordering: 'first' }));
  });
});

describe('scoreTemporalRelevance', () => {
  const makeFact = (eventDate: string | null) => ({
    id: crypto.randomUUID(),
    eventDate: eventDate ? new Date(eventDate) : null,
    documentDate: null,
    createdAt: new Date(),
  });

  it('should score facts with closer eventDates higher', () => {
    const candidates = [
      { fact: makeFact('2023-03-15'), temporalScore: 0 },
      { fact: makeFact('2023-07-01'), temporalScore: 0 },
      { fact: makeFact('2023-03-10'), temporalScore: 0 },
    ] as unknown as Candidate[];

    const timeRef = { month: 2, day: 15, year: 2023 }; // March 15
    scoreTemporalRelevance(candidates, timeRef);

    // March 15 should score highest, March 10 next, July 1 lowest
    expect(candidates[0]!.temporalScore).toBeGreaterThan(candidates[1]!.temporalScore);
    expect(candidates[2]!.temporalScore).toBeGreaterThan(candidates[1]!.temporalScore);
  });

  it('should give 0 to facts without eventDate', () => {
    const candidates = [
      { fact: makeFact(null), temporalScore: 0 },
    ] as unknown as Candidate[];

    scoreTemporalRelevance(candidates, { month: 2 });
    expect(candidates[0]!.temporalScore).toBe(0);
  });

  it('should sort by eventDate ascending when ordering is "first"', () => {
    const candidates = [
      { fact: makeFact('2023-03-15'), temporalScore: 0 },
      { fact: makeFact('2023-02-07'), temporalScore: 0 },
      { fact: makeFact('2023-04-01'), temporalScore: 0 },
    ] as unknown as Candidate[];

    scoreTemporalRelevance(candidates, { ordering: 'first' });

    // Feb 7 should score highest (earliest)
    expect(candidates[1]!.temporalScore).toBeGreaterThan(candidates[0]!.temporalScore);
    expect(candidates[0]!.temporalScore).toBeGreaterThan(candidates[2]!.temporalScore);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/engine && bun test tests/retrieval/temporal-scorer.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement temporal scorer**

Create `packages/engine/src/retrieval/temporal-scorer.ts`:

```typescript
import type { Candidate } from './types.js';

export interface TimeReference {
  year?: number;
  month?: number;  // 0-indexed (JS Date convention)
  day?: number;
  ordering?: 'first' | 'last';
}

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];
const MONTH_ABBR = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

/**
 * Extract temporal references from a search query.
 * Returns null if query has no temporal component.
 */
export function extractTimeReference(query: string): TimeReference | null {
  const lower = query.toLowerCase();

  // Check for ordering intent
  let ordering: 'first' | 'last' | undefined;
  if (/\bfirst\b/.test(lower)) ordering = 'first';
  if (/\blast\b/.test(lower) && !/\blast\s+(week|month|year)\b/.test(lower)) ordering = 'last';

  // Try explicit date: "March 15th", "15 March", "March 15, 2023"
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    const name = MONTH_NAMES[i]!;
    const abbr = MONTH_ABBR[i]!;
    const monthPattern = new RegExp(`(?:${name}|${abbr})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:[,\\s]+(\\d{4}))?`, 'i');
    const match = lower.match(monthPattern);
    if (match) {
      return {
        month: i,
        day: parseInt(match[1]!, 10),
        year: match[2] ? parseInt(match[2], 10) : undefined,
        ordering,
      };
    }
    // "15 March" format
    const reversePattern = new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:${name}|${abbr})(?:[,\\s]+(\\d{4}))?`, 'i');
    const revMatch = lower.match(reversePattern);
    if (revMatch) {
      return {
        month: i,
        day: parseInt(revMatch[1]!, 10),
        year: revMatch[2] ? parseInt(revMatch[2], 10) : undefined,
        ordering,
      };
    }
  }

  // Try month-only: "in February", "during March"
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    const name = MONTH_NAMES[i]!;
    const abbr = MONTH_ABBR[i]!;
    if (lower.includes(name) || lower.includes(abbr)) {
      return { month: i, ordering };
    }
  }

  // Relative time: "last week", "yesterday"
  if (/\byesterday\b/.test(lower)) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), ordering };
  }
  if (/\blast\s+week\b/.test(lower)) {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), ordering };
  }
  if (/\blast\s+month\b/.test(lower)) {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return { year: d.getFullYear(), month: d.getMonth(), ordering };
  }

  // If just ordering with no date context, still return it
  if (ordering) return { ordering };

  return null;
}

/**
 * Score candidates by temporal proximity to the query's time reference.
 * Mutates candidates in place, setting their `temporalScore`.
 */
export function scoreTemporalRelevance(
  candidates: Candidate[],
  timeRef: TimeReference,
): void {
  // For ordering queries ("which first/last"), score by eventDate order
  if (timeRef.ordering && !timeRef.month && !timeRef.day && !timeRef.year) {
    const withDates = candidates.filter(c => c.fact.eventDate != null);
    if (withDates.length === 0) return;

    // Sort by eventDate
    withDates.sort((a, b) => {
      const aDate = new Date(a.fact.eventDate!).getTime();
      const bDate = new Date(b.fact.eventDate!).getTime();
      return timeRef.ordering === 'first' ? aDate - bDate : bDate - aDate;
    });

    // Assign scores: highest to most relevant position
    for (let i = 0; i < withDates.length; i++) {
      withDates[i]!.temporalScore = 1.0 - (i / withDates.length);
    }
    return;
  }

  // For date-proximity queries, score by distance to reference date
  // Build a reference timestamp
  const now = new Date();
  const refYear = timeRef.year ?? now.getFullYear();
  const refMonth = timeRef.month ?? 0;
  const refDay = timeRef.day ?? 15; // middle of month if no day specified
  const refDate = new Date(refYear, refMonth, refDay);
  const refTime = refDate.getTime();

  // Find max distance for normalization
  let maxDistance = 0;
  for (const c of candidates) {
    const eventDate = c.fact.eventDate ?? c.fact.documentDate;
    if (!eventDate) continue;
    const dist = Math.abs(new Date(eventDate).getTime() - refTime);
    if (dist > maxDistance) maxDistance = dist;
  }

  if (maxDistance === 0) return;

  for (const c of candidates) {
    const eventDate = c.fact.eventDate ?? c.fact.documentDate;
    if (!eventDate) {
      c.temporalScore = 0;
      continue;
    }
    const dist = Math.abs(new Date(eventDate).getTime() - refTime);
    // Inverse distance, normalized to [0, 1]
    c.temporalScore = 1.0 - (dist / maxDistance);
  }
}
```

- [ ] **Step 4: Run temporal scorer tests**

```bash
cd packages/engine && bun test tests/retrieval/temporal-scorer.test.ts
```

Expected: PASS

- [ ] **Step 5: Add `temporalScore` to Candidate and FusionWeights**

In `packages/engine/src/retrieval/types.ts`:

Add to `FusionWeights`:
```typescript
temporal: number;  // default 0.10
```

Add to `Candidate`:
```typescript
temporalScore: number;  // 0 if not from temporal scoring
```

Add to `SearchResult.signals`:
```typescript
temporalScore: number;
```

Update `DEFAULT_FUSION_WEIGHTS` — redistribute weights to make room for temporal:
```typescript
export const DEFAULT_FUSION_WEIGHTS: FusionWeights = {
  vector: 0.30,    // was 0.35
  keyword: 0.15,
  graph: 0.15,     // was 0.20
  recency: 0.10,   // was 0.15
  salience: 0.10,  // was 0.15
  temporal: 0.20,  // NEW — high weight because temporal reasoning is a key weakness
};
```

- [ ] **Step 6: Update fusion.ts to include temporal signal**

In `packages/engine/src/retrieval/fusion.ts`:

Update weight normalization (line ~35-51) to include `weights.temporal`.

Update factMap entries to include `temporalScore: number`.

Update the max-merge logic (line ~74) to include `temporalScore`.

Update the score computation (line ~94-99):
```typescript
const score =
  entry.vectorScore * w.vector +
  entry.keywordScore * w.keyword +
  entry.graphScore * w.graph +
  entry.recencyScore * w.recency +
  entry.salienceScore * w.salience +
  entry.temporalScore * w.temporal;
```

Update `FusionResult.signals` to include `temporalScore`.

- [ ] **Step 7: Update config.ts retrievalWeights**

In `packages/engine/src/config.ts`, add to `retrievalWeights` schema:
```typescript
temporal: z.number().min(0).max(1).default(0.20),
```

- [ ] **Step 8: Wire temporal scorer into search.ts**

In `packages/engine/src/retrieval/search.ts`:

Import:
```typescript
import { extractTimeReference, scoreTemporalRelevance } from './temporal-scorer.js';
```

After step 4 (scoreSalience) and before step 5 (fuseAndRank), add:

```typescript
// 4b. Score temporal relevance if query has time references
const timeRef = extractTimeReference(options.query);
if (timeRef) {
  scoreTemporalRelevance(scoredCandidates, timeRef);
}
```

Also ensure new Candidates created in compound-search and graph-traversal initialize `temporalScore: 0`.

- [ ] **Step 9: Update fusion.test.ts**

Read `packages/engine/tests/retrieval/fusion.test.ts`. Add `temporalScore` to all test candidate objects and update expected weight normalization.

- [ ] **Step 10: Update search.test.ts**

Read `packages/engine/tests/retrieval/search.test.ts`. Update mock candidates and assertions to include `temporalScore`.

- [ ] **Step 11: Run all tests**

```bash
cd packages/engine && bun test
```

Expected: PASS

- [ ] **Step 12: Commit**

```bash
git add packages/engine/src/retrieval/temporal-scorer.ts packages/engine/tests/retrieval/temporal-scorer.test.ts packages/engine/src/retrieval/types.ts packages/engine/src/retrieval/fusion.ts packages/engine/src/retrieval/search.ts packages/engine/src/config.ts packages/engine/tests/retrieval/fusion.test.ts packages/engine/tests/retrieval/search.test.ts
git commit -m "feat: add temporal retrieval signal for date-proximity and ordering queries"
```

---

### Task 7: Return Source Chunks in Search Results

When returning search results, include the `sourceChunk` so the answer model can reason from the original conversation context, not just the atomic fact.

**Files:**
- Modify: `packages/engine/src/retrieval/search.ts:200-205`
- Modify: `packages/engine/src/retrieval/types.ts:28-48`

- [ ] **Step 1: Add `sourceChunk` to SearchResult**

In `packages/engine/src/retrieval/types.ts`, the `SearchResult` already contains `fact: Fact`, and we added `sourceChunk` to the Fact model in Task 2. So `result.fact.sourceChunk` is already available in search results.

No changes needed here — the Fact model flows through automatically. Verify by checking that `SearchResult.fact` is typed as `Fact` (which now includes `sourceChunk`).

- [ ] **Step 2: Verify the full flow works end-to-end**

Run all tests:

```bash
cd packages/engine && bun test
```

Expected: PASS

- [ ] **Step 3: Commit (if any changes were needed)**

```bash
git add -A && git commit -m "feat: source chunks available in search results via fact.sourceChunk"
```

---

### Task 8: Enhance Extraction Prompt for Temporal Grounding

Strengthen the fact extraction prompt to always extract `eventDate` and `documentDate` as structured fields, not just inline text. This ensures the temporal scorer has data to work with.

**Files:**
- Modify: `packages/engine/src/extraction/prompts.ts:7-61`
- Modify: `packages/engine/src/extraction/llm-extractor.ts` (parse new fields)

- [ ] **Step 1: Update FACT_EXTRACTION_PROMPT output format**

In `packages/engine/src/extraction/prompts.ts`, change the output format (line ~52-53) from:

```
{"facts": [{"t": "fact text here", "i": 0.7}, {"t": "another fact", "i": 0.3}]}
```

To:

```
{"facts": [{"t": "fact text here", "i": 0.7, "ed": "2023-05-07", "dd": "2023-05-08"}, ...]}

- ed (eventDate): ISO date of WHEN the event in the fact occurred (null if not temporal)
- dd (documentDate): ISO date of when the conversation took place (from context header)
```

Also add to the RULES section:

```
8. For EVERY fact, include "ed" (event date) if the fact describes something that happened at a specific time.
   - "User went to the gym on May 7" → ed: "2023-05-07"
   - "User prefers dark mode" → ed: null (timeless preference)
   If the conversation header says "[This conversation took place on 8 May, 2023]", set "dd" to "2023-05-08" for all facts.
```

- [ ] **Step 2: Parse `ed`/`dd` fields in llm-extractor.ts**

In the fact-parsing code of `llm-extractor.ts`, after extracting `t` (text) and `i` (importance), also extract:

```typescript
const eventDate = rawFact.ed ? new Date(rawFact.ed) : undefined;
const documentDate = rawFact.dd ? new Date(rawFact.dd) : undefined;
```

Add `eventDate` and `documentDate` to `ExtractedFact` type in `types.ts`:

```typescript
eventDate?: Date;
documentDate?: Date;
```

- [ ] **Step 3: Pass temporal fields through pipeline to createFact**

In `packages/engine/src/extraction/pipeline.ts`, in the `createFact` call, add:

```typescript
eventDate: fact.eventDate,
documentDate: fact.documentDate,
```

Note: The `CreateFactSchema` doesn't have `eventDate`/`documentDate` yet. Check if they need to be added. The `FactSchema` has them as optional, but `CreateFactSchema` may not. Add them to `CreateFactSchema`:

```typescript
eventDate: z.coerce.date().optional(),
documentDate: z.coerce.date().optional(),
```

- [ ] **Step 4: Run all tests**

```bash
cd packages/engine && bun test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/extraction/prompts.ts packages/engine/src/extraction/llm-extractor.ts packages/engine/src/extraction/types.ts packages/engine/src/extraction/pipeline.ts packages/engine/src/models/fact.ts
git commit -m "feat: extract eventDate/documentDate as structured fields during fact extraction"
```

---

### Task 9: Use Knowledge Chains in Retrieval (Suppress Stale Facts)

When search results contain facts with `metadata.relatedFactId` and `metadata.relationType === 'updates'`, fetch the related chain and prefer the newest version.

**Files:**
- Modify: `packages/engine/src/retrieval/search.ts`

- [ ] **Step 1: Add knowledge chain resolution after fusion**

In `packages/engine/src/retrieval/search.ts`, after lineage dedup (~line 154-164), add:

```typescript
// 5c. Knowledge chain resolution — if a result has metadata.relationType === 'updates',
// check if the fact it updates is ALSO in results. If so, suppress the older one.
const updatedFactIds = new Set<string>();
for (const r of dedupedResults) {
  if (r.fact.metadata?.relationType === 'updates' && r.fact.metadata?.relatedFactId) {
    updatedFactIds.add(r.fact.metadata.relatedFactId as string);
  }
}
if (updatedFactIds.size > 0) {
  dedupedResults = dedupedResults.filter(r => !updatedFactIds.has(r.fact.id));
}
```

This ensures that when "My favorite color is green" (updates "My favorite color is blue"), the blue fact is suppressed.

- [ ] **Step 2: Run tests**

```bash
cd packages/engine && bun test tests/retrieval/search.test.ts
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/retrieval/search.ts
git commit -m "feat: suppress stale facts via knowledge chain resolution during retrieval"
```

---

### Task 10: Full Integration Test + Build Verification

Run the complete test suite and build to make sure nothing is broken.

**Files:**
- None (verification only)

- [ ] **Step 1: Run all engine tests**

```bash
cd packages/engine && bun test
```

Expected: All tests PASS

- [ ] **Step 2: Run full monorepo build**

```bash
pnpm -r build
```

Expected: All 12 packages build successfully

- [ ] **Step 3: Run tests across all packages**

```bash
pnpm -r test
```

Expected: All tests pass

- [ ] **Step 4: Commit any remaining fixes**

If any tests broke, fix them and commit.

```bash
git add -A && git commit -m "fix: update tests for pipeline architecture changes"
```

---

### Task 11: Write README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write a comprehensive README**

The README should cover:
- What Steno is (memory engine for LLMs)
- Architecture overview (extraction pipeline, knowledge graph, multi-signal retrieval)
- Quick start (MCP server for Claude Code)
- Package overview (what each package does)
- Key features (temporal grounding, relational versioning, source chunk preservation)
- How retrieval works (6 signals: vector, keyword, graph, recency, salience, temporal)
- Configuration
- Contributing

Keep it concise but informative. Show a single code example of the MCP config.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add project README"
```

---

Plan complete and saved to `docs/superpowers/plans/2026-03-25-pipeline-architecture-fixes.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?

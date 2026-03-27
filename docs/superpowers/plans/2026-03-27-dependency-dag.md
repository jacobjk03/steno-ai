# Dependency DAG System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ordering, status, dependencies, cross-roadmap edges, and deadline connections to Steno's knowledge graph so it can answer "what's blocking me?" and "what ships before April 12?"

**Architecture:** Add new edge types (`precedes`, `depends_on`, `deadline`) to the engine config. Add status metadata to priority facts. Create dependency edges between existing priority facts. Create a deadline entity for ASU+GSV and connect relevant priorities. Update both Supabase databases' constraints. Update the cross-linker LLM prompt to detect dependencies.

**Tech Stack:** @steno-ai/engine, Supabase (personal: zhqcetwuecedebrbawxl, Navia: lomexlacflymoiulgjzn)

---

## File Structure

### Modified Files
- `packages/engine/src/config.ts:83-93` — Add new edge types
- `packages/engine/src/extraction/cross-linker.ts:148-160` — Update LLM classification prompt

### Database Changes (both Supabase instances)
- Update `edges` table edge_type CHECK constraint
- Create dependency edges between priority facts
- Create ASU+GSV Summit deadline entity
- Add status metadata to priority facts

### Fact IDs Reference
```
SESSION_INGESTION = '114cde10-...'  (full: query DB)
PATTERN_DETECTION = '81f67948-...'
CODEBASE_MEMORY   = '40b7ab3b-...'
ENCRYPTION        = '7b4ac24f-...'
PHASE3_MAGIC      = '775b186d-...'
GRAPH_VIZ         = 'e62295af-...'
```

### Entity IDs Reference
```
STENO_ENTITY      = '3d5ffbc3-7820-4e72-9af3-dcbb1d180fe4'
STENO_ROADMAP     = 'd090921c-0e08-43a3-9315-364f55b59ad2'
```

---

### Task 1: Add New Edge Types to Config

**Files:**
- Modify: `packages/engine/src/config.ts:83-93`

- [ ] **Step 1: Add precedes, depends_on, deadline edge types**

In `packages/engine/src/config.ts`, change the EDGE_TYPES array:

```typescript
export const EDGE_TYPES = [
  'associative',
  'causal',
  'temporal',
  'contradictory',
  'hierarchical',
  'updates',      // new fact supersedes old one (knowledge chain)
  'extends',      // new fact adds detail to old one
  'derives',      // new fact is inferred from combining others
  'precedes',     // A must happen before B (ordering)
  'depends_on',   // A requires B to be done first (blocking dependency)
  'deadline',     // A must be done before deadline D
] as const;
```

- [ ] **Step 2: Build engine**

```bash
cd packages/engine && pnpm build
```

- [ ] **Step 3: Run tests**

```bash
bun test tests/models/edge.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/config.ts
git commit -m "feat: add precedes, depends_on, deadline edge types for DAG"
```

---

### Task 2: Update Supabase Edge Type Constraints

**Files:** None (SQL only)

- [ ] **Step 1: Update personal Steno Supabase constraint**

Using the Supabase Management API:

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/zhqcetwuecedebrbawxl/database/query" \
  -H "Authorization: Bearer sbp_5a61307562a8835ee8459c391a7c4c67bec95fda" \
  -H "Content-Type: application/json" \
  -d '{"query": "ALTER TABLE edges DROP CONSTRAINT IF EXISTS edges_edge_type_check; ALTER TABLE edges ADD CONSTRAINT edges_edge_type_check CHECK (edge_type = ANY (ARRAY['"'"'associative'"'"', '"'"'causal'"'"', '"'"'temporal'"'"', '"'"'contradictory'"'"', '"'"'hierarchical'"'"', '"'"'updates'"'"', '"'"'extends'"'"', '"'"'derives'"'"', '"'"'precedes'"'"', '"'"'depends_on'"'"', '"'"'deadline'"'"', '"'"'semantic'"'"', '"'"'contradicts'"'"', '"'"'supports'"'"']));"}'
```

- [ ] **Step 2: Update Navia Supabase constraint**

Use `mcp__plugin_supabase_supabase__execute_sql` with project_id `lomexlacflymoiulgjzn`:

```sql
ALTER TABLE edges DROP CONSTRAINT IF EXISTS edges_edge_type_check;
ALTER TABLE edges ADD CONSTRAINT edges_edge_type_check CHECK (
  edge_type = ANY (ARRAY[
    'associative', 'causal', 'temporal', 'contradictory', 'hierarchical',
    'updates', 'extends', 'derives', 'precedes', 'depends_on', 'deadline',
    'semantic', 'contradicts', 'supports'
  ])
);
```

- [ ] **Step 3: Verify constraints**

Query both databases to confirm the constraint was updated.

---

### Task 3: Add Status Metadata to Priority Facts

**Files:** None (SQL only — metadata updates)

- [ ] **Step 1: Update priority fact metadata with status**

On personal Steno Supabase, update each priority fact's metadata to include status:

```sql
-- Session ingestion: not started
UPDATE facts SET metadata = metadata || '{"status": "not_started", "priority_order": 1}'::jsonb
WHERE id = '114cde10-...full-id...';

-- Pattern detection: done (Phase 2 completed)
UPDATE facts SET metadata = metadata || '{"status": "done", "priority_order": 2}'::jsonb
WHERE id = '81f67948-...full-id...';

-- Codebase memory: not started
UPDATE facts SET metadata = metadata || '{"status": "not_started", "priority_order": 4}'::jsonb
WHERE id = '40b7ab3b-...full-id...';

-- Encryption: not started
UPDATE facts SET metadata = metadata || '{"status": "not_started", "priority_order": 5}'::jsonb
WHERE id = '7b4ac24f-...full-id...';

-- Phase 3 magic opening moment: not started
UPDATE facts SET metadata = metadata || '{"status": "not_started", "priority_order": 3}'::jsonb
WHERE id = '775b186d-...full-id...';

-- Graph visualization: not started
UPDATE facts SET metadata = metadata || '{"status": "not_started", "priority_order": 6}'::jsonb
WHERE id = 'e62295af-...full-id...';
```

Get the full IDs first, then run the updates.

---

### Task 4: Create Dependency Edges (DAG)

**Files:** None (SQL only — edge creation)

The dependency DAG:
```
Session Ingestion (1)
  └── precedes → Pattern Detection (2)
       └── precedes → Magic Opening Moment (3)
  └── precedes → Magic Opening Moment (3)

Pattern Detection (2)
  └── depends_on → Session Ingestion (1)

Magic Opening Moment (3)
  └── depends_on → Session Ingestion (1)
  └── depends_on → Pattern Detection (2)

Codebase Memory (4) — independent
Encryption (5) — independent
Graph Visualization (6) — depends_on → Pattern Detection (2)
```

- [ ] **Step 1: Get full fact IDs**

Query the DB for the complete UUIDs of all 6 priority facts.

- [ ] **Step 2: Create precedes edges**

```sql
-- Session ingestion precedes Pattern detection
INSERT INTO edges (id, tenant_id, source_id, target_id, relation, edge_type, weight, confidence, fact_id, metadata)
VALUES (uuid_generate_v4(), '00000000-0000-0000-0000-000000000001',
  '3d5ffbc3-7820-4e72-9af3-dcbb1d180fe4', '3d5ffbc3-7820-4e72-9af3-dcbb1d180fe4',
  'precedes', 'precedes', 0.95, 0.95, '<SESSION_INGESTION_FACT_ID>',
  '{"sourceFactId": "<SESSION_INGESTION_FACT_ID>", "targetFactId": "<PATTERN_DETECTION_FACT_ID>", "reason": "dependency_order"}'::jsonb);

-- Session ingestion precedes Magic opening moment
-- Pattern detection precedes Magic opening moment
-- (repeat for each edge in the DAG)
```

- [ ] **Step 3: Create depends_on edges (reverse direction)**

```sql
-- Pattern detection depends_on Session ingestion
-- Magic opening moment depends_on Session ingestion
-- Magic opening moment depends_on Pattern detection
-- Graph visualization depends_on Pattern detection
```

- [ ] **Step 4: Verify the DAG**

```sql
SELECT e.relation, e.metadata->>'sourceFactId' as source, e.metadata->>'targetFactId' as target
FROM edges e
WHERE e.relation IN ('precedes', 'depends_on')
ORDER BY e.relation, e.created_at;
```

---

### Task 5: Create ASU+GSV Deadline Entity and Edges

**Files:** None (SQL only)

- [ ] **Step 1: Create ASU+GSV Summit entity**

```sql
INSERT INTO entities (id, tenant_id, name, entity_type, canonical_name, properties)
VALUES (uuid_generate_v4(), '00000000-0000-0000-0000-000000000001',
  'ASU+GSV Summit 2026', 'event', 'asu gsv summit 2026',
  '{"date": "2026-04-12", "location": "San Diego", "description": "Navia presentation at ASU+GSV"}'::jsonb);
```

- [ ] **Step 2: Link priority facts to the deadline**

Connect priorities that need to ship before April 12:
- Session ingestion → deadline → ASU+GSV
- Phase 3 magic opening moment → deadline → ASU+GSV

```sql
INSERT INTO edges (id, tenant_id, source_id, target_id, relation, edge_type, weight, confidence, fact_id, metadata)
SELECT uuid_generate_v4(), '00000000-0000-0000-0000-000000000001',
  '3d5ffbc3-7820-4e72-9af3-dcbb1d180fe4', -- steno entity
  (SELECT id FROM entities WHERE canonical_name = 'asu gsv summit 2026'),
  'deadline', 'deadline', 0.95, 0.95, f.id,
  jsonb_build_object('reason', 'must_ship_before_event', 'deadline', '2026-04-12')
FROM facts f WHERE f.id IN ('<SESSION_INGESTION_ID>', '<PHASE3_ID>');
```

- [ ] **Step 3: Link fact_entities for the deadline entity**

```sql
INSERT INTO fact_entities (fact_id, entity_id, role)
SELECT f.id, (SELECT id FROM entities WHERE canonical_name = 'asu gsv summit 2026'), 'mentioned'
FROM facts f WHERE f.id IN ('<SESSION_INGESTION_ID>', '<PHASE3_ID>')
ON CONFLICT DO NOTHING;
```

---

### Task 6: Update Cross-Linker LLM Prompt

**Files:**
- Modify: `packages/engine/src/extraction/cross-linker.ts:148-160`

- [ ] **Step 1: Update the classification prompt to include dependency types**

Find the LLM prompt in the cross-linker and update:

```typescript
content: `Classify the relationship between each pair of facts. For each pair, output:
- relation: one of "part_of", "has_child", "extends", "derives", "precedes", "depends_on", "deadline", "relates_to"
- direction: "forward" (NEW → EXISTING) or "reverse" (EXISTING → NEW)

Relationship meanings:
- part_of: the NEW fact is a component/subtask/member of the EXISTING fact
- has_child: the NEW fact is a parent/container of the EXISTING fact
- extends: the NEW fact adds detail to the EXISTING fact
- derives: the NEW fact is inferred from the EXISTING fact
- precedes: the NEW fact should happen BEFORE the EXISTING fact (ordering)
- depends_on: the NEW fact REQUIRES the EXISTING fact to be done first (blocking)
- deadline: the NEW fact must be completed before the EXISTING fact (time constraint)
- relates_to: loosely related but no clear hierarchy or dependency

Return ONLY a JSON array: [{"index": 0, "relation": "depends_on", "direction": "forward"}, ...]`
```

- [ ] **Step 2: Update valid relations list**

In the edge creation section, update:

```typescript
const validRelations = ['part_of', 'has_child', 'extends', 'derives', 'precedes', 'depends_on', 'deadline', 'relates_to'];
```

And the edge type mapping:

```typescript
const edgeType = relation === 'extends' ? 'extends' as const
  : relation === 'derives' ? 'derives' as const
  : relation === 'precedes' ? 'precedes' as const
  : relation === 'depends_on' ? 'depends_on' as const
  : relation === 'deadline' ? 'deadline' as const
  : relation === 'part_of' || relation === 'has_child' ? 'hierarchical' as const
  : 'associative' as const;
```

- [ ] **Step 3: Build and test**

```bash
cd packages/engine && pnpm build
bun test tests/extraction/pipeline.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/extraction/cross-linker.ts
git commit -m "feat: cross-linker detects dependency/ordering relationships"
```

---

### Task 7: Publish and Push

- [ ] **Step 1: Bump version**

```bash
sed -i '' 's/"version": "0.1.8"/"version": "0.1.9"/' packages/engine/package.json
```

- [ ] **Step 2: Build, publish, push**

```bash
cd packages/engine && pnpm build && npm publish --access public
cd ../..
git add packages/engine/
git commit -m "feat: dependency DAG — precedes, depends_on, deadline edge types"
git push
```

---

### Task 8: Test Queries

- [ ] **Step 1: "What's blocking me right now?"**

Query the personal Steno Supabase:

```sql
-- Facts with depends_on edges where the dependency is not "done"
SELECT f.content, f.metadata->>'status' as status,
  dep_fact.content as blocked_by,
  dep_fact.metadata->>'status' as dep_status
FROM edges e
JOIN facts f ON e.fact_id = f.id
JOIN facts dep_fact ON (e.metadata->>'targetFactId')::uuid = dep_fact.id
WHERE e.relation = 'depends_on'
AND dep_fact.metadata->>'status' != 'done';
```

Expected: Phase 3 is blocked by Session Ingestion (not_started).

- [ ] **Step 2: "What needs to ship before April 12?"**

```sql
SELECT f.content, f.metadata->>'status' as status
FROM edges e
JOIN facts f ON e.fact_id = f.id
JOIN entities deadline ON e.target_id = deadline.id
WHERE e.relation = 'deadline'
AND deadline.canonical_name = 'asu gsv summit 2026';
```

Expected: Session ingestion and Phase 3 magic opening moment.

- [ ] **Step 3: "What can I work on right now?" (no blockers)**

```sql
-- Priorities that are not_started AND have no unmet depends_on
SELECT f.content, f.metadata->>'status' as status
FROM facts f
JOIN fact_entities fe ON f.id = fe.fact_id
WHERE fe.entity_id = 'd090921c-0e08-43a3-9315-364f55b59ad2'  -- roadmap entity
AND f.metadata->>'status' = 'not_started'
AND NOT EXISTS (
  SELECT 1 FROM edges e
  JOIN facts dep ON (e.metadata->>'targetFactId')::uuid = dep.id
  WHERE e.fact_id = f.id
  AND e.relation = 'depends_on'
  AND dep.metadata->>'status' != 'done'
);
```

Expected: Session ingestion, Codebase memory, Encryption (no blockers). Phase 3 and Graph viz are blocked.

---

## Spec Coverage Checklist

| Requirement | Task |
|------------|------|
| New edge types (precedes, depends_on, deadline) | Task 1 |
| Supabase constraint updates (both DBs) | Task 2 |
| Status on priority facts | Task 3 |
| Dependency edges (DAG) | Task 4 |
| Deadline entity + edges (ASU+GSV) | Task 5 |
| Cross-linker detects dependencies | Task 6 |
| Publish + push | Task 7 |
| Test queries (blocking, deadlines, available work) | Task 8 |
| Cross-roadmap edges (Navia ↔ Steno) | Task 4 (included in dependency edges) |
| Priority ordering | Task 3 (priority_order in metadata) + Task 4 (precedes edges) |

/**
 * FULL INFRASTRUCTURE AUDIT
 *
 * Traces every single component of the Steno pipeline with real data.
 * No assumptions. No mocks. Every signal, every step, traced and reported.
 */

import { createSupabaseClient, SupabaseStorageAdapter } from '../packages/supabase-adapter/src/index.js';
import { OpenAILLMAdapter, OpenAIEmbeddingAdapter } from '../packages/openai-adapter/src/index.js';
import { search } from '../packages/engine/src/retrieval/search.js';
import { compoundSearchSignal } from '../packages/engine/src/retrieval/compound-search.js';
import { graphSearch, tokenizeQuery } from '../packages/engine/src/retrieval/graph-traversal.js';
import { matchTriggers } from '../packages/engine/src/retrieval/trigger-matcher.js';
import { scoreSalience } from '../packages/engine/src/retrieval/salience-scorer.js';
import { fuseAndRank } from '../packages/engine/src/retrieval/fusion.js';
import { rerank } from '../packages/engine/src/retrieval/reranker.js';
import { config } from 'dotenv';
config({ path: '.env' });

async function main() {
  const supabase = createSupabaseClient({ url: process.env.SUPABASE_URL!, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY! });
  const storage = new SupabaseStorageAdapter(supabase);
  const embedding = new OpenAIEmbeddingAdapter({ apiKey: process.env.OPENAI_API_KEY!, model: 'text-embedding-3-large', dimensions: 3072 });
  const cheapLLM = new OpenAILLMAdapter({ apiKey: process.env.OPENAI_API_KEY!, model: 'gpt-4.1-nano' });

  const tenantId = '00000000-0000-0000-0000-b00000000001';
  const scopeId = '51a45a95-run-20260322-100948'; // Q3: coupon question

  const query = "Where did I redeem a $5 coupon on coffee creamer?";
  const expectedAnswer = "Target";

  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║         STENO FULL INFRASTRUCTURE AUDIT             ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`\nQuery: "${query}"`);
  console.log(`Expected: "${expectedAnswer}"\n`);

  // ═══════════════════════════════════════════════════════
  // AUDIT 1: DATABASE STATE
  // ═══════════════════════════════════════════════════════
  console.log('━━━ AUDIT 1: DATABASE STATE ━━━');

  const factCount = await supabase.from('facts').select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId).eq('scope_id', scopeId);
  console.log(`Total facts: ${factCount.count}`);

  const targetFacts = await supabase.from('facts').select('id, content')
    .eq('tenant_id', tenantId).eq('scope_id', scopeId)
    .ilike('content', '%target%');
  console.log(`Facts containing "Target": ${targetFacts.data?.length ?? 0}`);
  for (const f of (targetFacts.data ?? [])) {
    console.log(`  → ${(f as any).content.slice(0, 120)}`);
  }

  const entityCount = await supabase.from('entities').select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  console.log(`\nTotal entities: ${entityCount.count}`);

  const edgeCount = await supabase.from('edges').select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  console.log(`Total edges: ${edgeCount.count}`);

  // Check entity quality
  const entities = await supabase.from('entities').select('name, entity_type, canonical_name')
    .eq('tenant_id', tenantId).limit(20);
  console.log(`\nSample entities (first 20):`);
  for (const e of (entities.data ?? []).slice(0, 20)) {
    const ent = e as any;
    const hasGarbage = ent.name.includes('**') || ent.name.includes(':') || ent.name.includes('#');
    console.log(`  ${hasGarbage ? '⚠️ GARBAGE' : '  OK'} [${ent.entity_type}] "${ent.name}"`);
  }

  // Check edges quality
  const edges = await supabase.from('edges').select('source_id, target_id, relation, edge_type')
    .eq('tenant_id', tenantId).limit(10);
  console.log(`\nSample edges (first 10):`);
  if ((edges.data ?? []).length === 0) {
    console.log('  ⚠️ ZERO EDGES — graph traversal signal is completely dead');
  }
  for (const e of (edges.data ?? [])) {
    const ed = e as any;
    console.log(`  [${ed.edge_type}] ${ed.source_id.slice(0, 8)}... → ${ed.relation} → ${ed.target_id.slice(0, 8)}...`);
  }

  // ═══════════════════════════════════════════════════════
  // AUDIT 2: SIGNAL 1 — COMPOUND SEARCH (vector + keyword)
  // ═══════════════════════════════════════════════════════
  console.log('\n━━━ AUDIT 2: COMPOUND SEARCH (vector + keyword) ━━━');

  const compoundResults = await compoundSearchSignal(
    storage, embedding, query, tenantId, 'user', scopeId, 60
  );
  console.log(`Vector candidates: ${compoundResults.vectorCandidates.length}`);
  console.log(`Keyword candidates: ${compoundResults.keywordCandidates.length}`);

  console.log('\nVector top 10:');
  for (const c of compoundResults.vectorCandidates.slice(0, 10)) {
    const hasTarget = c.fact.content.toLowerCase().includes('target');
    console.log(`  ${hasTarget ? '>>> TARGET' : '          '} [${c.vectorScore.toFixed(3)}] ${c.fact.content.slice(0, 100)}`);
  }

  console.log('\nKeyword results:');
  if (compoundResults.keywordCandidates.length === 0) {
    console.log('  ⚠️ ZERO keyword results — FTS not finding anything for this query');
  }
  for (const c of compoundResults.keywordCandidates.slice(0, 5)) {
    console.log(`  [${c.keywordScore.toFixed(3)}] ${c.fact.content.slice(0, 100)}`);
  }

  // ═══════════════════════════════════════════════════════
  // AUDIT 3: SIGNAL 2 — GRAPH TRAVERSAL
  // ═══════════════════════════════════════════════════════
  console.log('\n━━━ AUDIT 3: GRAPH TRAVERSAL ━━━');

  const tokens = tokenizeQuery(query);
  console.log(`Query tokens: [${tokens.join(', ')}]`);

  const graphResults = await graphSearch(
    storage, embedding, query, tenantId, 'user', scopeId, 20
  );
  console.log(`Graph candidates: ${graphResults.length}`);
  if (graphResults.length === 0) {
    console.log('  ⚠️ ZERO graph results — graph traversal signal is dead');
    console.log('  Possible causes:');
    console.log('    1. No entities match query tokens');
    console.log('    2. Entities exist but have zero edges');
    console.log('    3. Entity names are garbage (markdown artifacts)');
  }
  for (const c of graphResults.slice(0, 5)) {
    console.log(`  [${c.graphScore.toFixed(3)}] ${c.fact.content.slice(0, 100)}`);
  }

  // ═══════════════════════════════════════════════════════
  // AUDIT 4: SIGNAL 3 — TRIGGERS
  // ═══════════════════════════════════════════════════════
  console.log('\n━━━ AUDIT 4: TRIGGERS ━━━');

  const triggerResults = await matchTriggers(
    storage, embedding, query, tenantId, 'user', scopeId
  );
  console.log(`Triggers matched: ${triggerResults.triggersMatched.length}`);
  console.log(`Trigger candidates: ${triggerResults.candidates.length}`);
  if (triggerResults.triggersMatched.length === 0) {
    console.log('  (No triggers set — this is expected for benchmark data)');
  }

  // ═══════════════════════════════════════════════════════
  // AUDIT 5: FUSION
  // ═══════════════════════════════════════════════════════
  console.log('\n━━━ AUDIT 5: FUSION ━━━');

  const allCandidates = [
    ...compoundResults.vectorCandidates,
    ...compoundResults.keywordCandidates,
    ...graphResults,
    ...triggerResults.candidates,
  ];
  console.log(`Total candidates before fusion: ${allCandidates.length}`);
  console.log(`  From vector: ${compoundResults.vectorCandidates.length}`);
  console.log(`  From keyword: ${compoundResults.keywordCandidates.length}`);
  console.log(`  From graph: ${graphResults.length}`);
  console.log(`  From triggers: ${triggerResults.candidates.length}`);

  const scored = scoreSalience(allCandidates);
  const fused = fuseAndRank(scored, { vector: 0.35, keyword: 0.15, graph: 0.20, recency: 0.15, salience: 0.15 }, 20);

  console.log(`\nFused top 10 (after fusion with weights):`);
  for (const r of fused.slice(0, 10)) {
    const hasTarget = r.fact.content.toLowerCase().includes('target');
    console.log(`  ${hasTarget ? '>>> TARGET' : '          '} [${r.score.toFixed(3)}] src=${r.source} | v=${r.signals.vectorScore.toFixed(2)} k=${r.signals.keywordScore.toFixed(2)} g=${r.signals.graphScore.toFixed(2)} r=${r.signals.recencyScore.toFixed(2)} s=${r.signals.salienceScore.toFixed(2)} | ${r.fact.content.slice(0, 80)}`);
  }

  // Where is Target in the fused results?
  const targetIdx = fused.findIndex(r => r.fact.content.toLowerCase().includes('target'));
  console.log(`\nTarget fact position in fused results: ${targetIdx === -1 ? 'NOT IN TOP 20' : `#${targetIdx + 1}`}`);

  // ═══════════════════════════════════════════════════════
  // AUDIT 6: RE-RANKER
  // ═══════════════════════════════════════════════════════
  console.log('\n━━━ AUDIT 6: RE-RANKER ━━━');

  // Simulate what search.ts does
  const searchResults = fused.map(f => ({
    fact: f.fact,
    score: f.score,
    signals: f.signals,
    triggeredBy: f.triggeredBy,
  }));

  console.log(`Input to reranker: ${searchResults.length} results, topK=20`);
  console.log(`Will reranker skip? ${searchResults.length <= 20 ? 'YES ⚠️ (length <= topK)' : 'NO'}`);

  const reranked = await rerank(cheapLLM, query, searchResults, 20);
  const rerankChanged = JSON.stringify(reranked.map(r => r.fact.id)) !== JSON.stringify(searchResults.map(r => r.fact.id));
  console.log(`Reranker changed order: ${rerankChanged ? 'YES' : 'NO ⚠️'}`);

  if (rerankChanged) {
    const targetIdxReranked = reranked.findIndex(r => r.fact.content.toLowerCase().includes('target'));
    console.log(`Target position after rerank: ${targetIdxReranked === -1 ? 'NOT FOUND' : `#${targetIdxReranked + 1}`}`);
  }

  // ═══════════════════════════════════════════════════════
  // AUDIT 7: ANSWER LLM
  // ═══════════════════════════════════════════════════════
  console.log('\n━━━ AUDIT 7: ANSWER LLM ━━━');

  const context = reranked.map(r => r.fact.content).join('\n');
  console.log(`Context length: ${context.length} chars`);
  console.log(`Context contains "Target": ${context.toLowerCase().includes('target')}`);
  console.log(`Context contains "Cartwheel": ${context.toLowerCase().includes('cartwheel')}`);

  const answer = await cheapLLM.complete([
    { role: 'system', content: 'Answer the question. "User" = the person asked about. Extract specific store names, places. Be precise.' },
    { role: 'user', content: `Context:\n${context}\n\nQuestion: ${query}` },
  ], { temperature: 0 });
  console.log(`\nAnswer: ${answer.content}`);
  console.log(`Contains expected "${expectedAnswer}": ${answer.content.toLowerCase().includes(expectedAnswer.toLowerCase())}`);

  // ═══════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║                    AUDIT SUMMARY                     ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`\n✓/✗ for each component:\n`);
  console.log(`  [${(targetFacts.data?.length ?? 0) > 0 ? '✓' : '✗'}] Database: Target facts exist`);
  console.log(`  [${compoundResults.vectorCandidates.some(c => c.fact.content.toLowerCase().includes('target')) ? '✓' : '✗'}] Vector search: finds Target`);
  console.log(`  [${compoundResults.keywordCandidates.length > 0 ? '✓' : '✗'}] Keyword search: returns results`);
  console.log(`  [${graphResults.length > 0 ? '✓' : '✗'}] Graph traversal: returns results`);
  console.log(`  [${(edgeCount.count ?? 0) > 0 ? '✓' : '✗'}] Edges exist in graph`);
  console.log(`  [${entities.data?.some((e: any) => !e.name.includes('**') && !e.name.includes(':')) ? '~' : '✗'}] Entity names are clean`);
  console.log(`  [${targetIdx >= 0 && targetIdx < 10 ? '✓' : '✗'}] Fusion: Target in top 10`);
  console.log(`  [${rerankChanged ? '✓' : '✗'}] Re-ranker: actually re-ranks`);
  console.log(`  [${context.toLowerCase().includes('target') ? '✓' : '✗'}] Context: contains Target`);
  console.log(`  [${answer.content.toLowerCase().includes(expectedAnswer.toLowerCase()) ? '✓' : '✗'}] Answer LLM: outputs Target`);
}

main().catch(err => { console.error('AUDIT FAILED:', err); process.exit(1); });

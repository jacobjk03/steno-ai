/**
 * End-to-end pipeline test — exercises ingestion + retrieval + dedup + all signals.
 * Run: npx tsx scripts/test-pipeline.ts
 */
import { config } from 'dotenv';
config({ path: '.env' });

import { createSupabaseClient, SupabaseStorageAdapter } from '../packages/supabase-adapter/src/index.js';
import { PerplexityEmbeddingAdapter } from '../packages/engine/src/adapters/perplexity-embedding.js';
import { OpenAILLMAdapter } from '../packages/openai-adapter/src/index.js';
import { runExtractionPipeline } from '../packages/engine/src/extraction/pipeline.js';
import { search } from '../packages/engine/src/retrieval/search.js';

const supabase = createSupabaseClient({ url: process.env.SUPABASE_URL!, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY! });
const storage = new SupabaseStorageAdapter(supabase);
const embedding = new PerplexityEmbeddingAdapter({ apiKey: process.env.PERPLEXITY_API_KEY!, model: 'pplx-embed-v1-4b', dimensions: 2000 });
const cheapLLM = new OpenAILLMAdapter({ apiKey: process.env.OPENAI_API_KEY!, model: 'gpt-4.1-mini' });

const TENANT = '00000000-0000-0000-0000-000000000099'; // test tenant
const SCOPE = 'user';
const SCOPE_ID = 'pipeline-test';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

async function setup() {
  try {
    await storage.createTenant({ id: TENANT, name: 'Pipeline Test', slug: `test-${Date.now()}`, plan: 'enterprise' });
  } catch {}
  await storage.purgeFacts(TENANT, SCOPE, SCOPE_ID);
  console.log('Setup: cleaned test tenant\n');
}

async function testIngestion() {
  console.log('=== TEST: Ingestion ===');

  const t0 = Date.now();
  const result = await runExtractionPipeline(
    { storage, embedding, cheapLLM, embeddingModel: 'pplx-embed-v1-4b', embeddingDim: 2000, extractionTier: 'auto' },
    {
      tenantId: TENANT, scope: SCOPE, scopeId: SCOPE_ID,
      inputType: 'raw_text',
      data: `[This conversation took place on 15 March 2026]

user: My name is Alex and I just moved to Tokyo from Berlin. I got a new job at Sony as a senior engineer.
assistant: That's exciting! How do you like Tokyo so far?
user: I love it. The food is amazing, especially the ramen near Shibuya station. My partner Yuki showed me around.
assistant: Yuki sounds great. What are you working on at Sony?
user: I'm building a real-time audio processing engine in Rust. Similar to what I did at my previous company in Berlin where I worked on WebRTC.
assistant: Rust for audio, nice choice.
user: Yeah I decided to use Rust over C++ because of memory safety. Also I prefer vim keybindings and dark mode in my editor. Oh and I hate writing CSS, always have.`,
    },
  );
  const duration = Date.now() - t0;

  assert(result.factsCreated > 0, `Created ${result.factsCreated} facts`, `expected > 0`);
  assert(result.entitiesCreated > 0, `Created ${result.entitiesCreated} entities`);
  assert(result.edgesCreated > 0, `Created ${result.edgesCreated} edges`);
  assert(duration < 30000, `Ingestion took ${duration}ms`, `expected < 30s`);
  console.log(`  Duration: ${duration}ms\n`);

  return result;
}

async function testRetrieval() {
  console.log('=== TEST: Retrieval Latency ===');

  const queries = [
    { q: "What is Alex's name?", expected: 'alex', type: 'identity' },
    { q: "Where does Alex live?", expected: 'tokyo', type: 'location' },
    { q: "Where did Alex work before Sony?", expected: 'berlin', type: 'temporal' },
    { q: "What programming language did Alex choose for audio?", expected: 'rust', type: 'decision' },
    { q: "Who is Yuki?", expected: 'partner', type: 'relationship' },
    { q: "What food does Alex like?", expected: 'ramen', type: 'preference' },
    { q: "What editor preferences does Alex have?", expected: 'vim', type: 'preference' },
    { q: "Does Alex like CSS?", expected: 'css', type: 'sentiment' },
    { q: "When did Alex move to Tokyo?", expected: 'march 2026', type: 'temporal' },
    { q: "What company does Alex work at?", expected: 'sony', type: 'employment' },
  ];

  const latencies: number[] = [];
  let correct = 0;

  for (const { q, expected, type } of queries) {
    const t0 = Date.now();
    const results = await search(
      { storage, embedding },
      { query: q, tenantId: TENANT, scope: SCOPE, scopeId: SCOPE_ID, limit: 5 },
    );
    const latency = Date.now() - t0;
    latencies.push(latency);

    const topContent = results.results.map(r => r.fact.content.toLowerCase()).join(' ');
    const found = topContent.includes(expected.toLowerCase());
    if (found) correct++;

    const signals = results.results[0]?.signals;
    const signalStr = signals
      ? `v=${signals.vectorScore.toFixed(2)} k=${signals.keywordScore.toFixed(2)} g=${signals.graphScore.toFixed(2)} r=${signals.recencyScore.toFixed(2)} s=${signals.salienceScore.toFixed(2)}`
      : 'no results';

    assert(found, `[${type}] "${q}" → ${found ? 'FOUND' : 'MISSING'} "${expected}" (${latency}ms) [${signalStr}]`);
  }

  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];
  const accuracy = (correct / queries.length * 100).toFixed(1);

  console.log(`\n  Accuracy: ${correct}/${queries.length} (${accuracy}%)`);
  console.log(`  Avg latency: ${avgLatency.toFixed(0)}ms`);
  console.log(`  P95 latency: ${p95Latency}ms`);
  assert(avgLatency < 2000, `Avg latency ${avgLatency.toFixed(0)}ms`, 'expected < 2000ms');
  assert(p95Latency! < 3000, `P95 latency ${p95Latency}ms`, 'expected < 3000ms');
  assert(correct >= 7, `Accuracy ${accuracy}%`, 'expected >= 70%');
  console.log('');
}

async function testDedup() {
  console.log('=== TEST: Dedup (Git-style append-only) ===');

  // Store an update to an existing fact
  const t0 = Date.now();
  const result = await runExtractionPipeline(
    { storage, embedding, cheapLLM, embeddingModel: 'pplx-embed-v1-4b', embeddingDim: 2000, extractionTier: 'auto' },
    {
      tenantId: TENANT, scope: SCOPE, scopeId: SCOPE_ID,
      inputType: 'raw_text',
      data: `Alex changed his mind about Rust. He now prefers Zig for the audio engine because of simpler syntax. Also Alex moved from Tokyo to Osaka for a quieter life.`,
    },
  );
  const duration = Date.now() - t0;

  assert(result.factsCreated > 0 || result.factsUpdated > 0, `Dedup created/updated facts (${result.factsCreated} new, ${result.factsUpdated} updated)`);
  console.log(`  Duration: ${duration}ms`);

  // Now search — should find BOTH old and new versions (append-only)
  const results = await search(
    { storage, embedding },
    { query: 'What programming language does Alex prefer?', tenantId: TENANT, scope: SCOPE, scopeId: SCOPE_ID, limit: 10 },
  );

  const contents = results.results.map(r => r.fact.content.toLowerCase());
  const hasRust = contents.some(c => c.includes('rust'));
  const hasZig = contents.some(c => c.includes('zig'));

  // With lineage dedup, only the newest version should show by default
  // But both should exist in the DB
  assert(hasZig, 'Found Zig (new preference) in results');
  // Rust may or may not show depending on lineage dedup
  console.log(`  Rust in results: ${hasRust} (OK either way — lineage dedup may hide it)`);

  // Search for location update
  const locResults = await search(
    { storage, embedding },
    { query: 'Where does Alex live now?', tenantId: TENANT, scope: SCOPE, scopeId: SCOPE_ID, limit: 5 },
  );
  const locContents = locResults.results.map(r => r.fact.content.toLowerCase()).join(' ');
  const hasOsaka = locContents.includes('osaka');
  assert(hasOsaka, 'Found Osaka (new location) in results');
  console.log('');
}

async function testSignals() {
  console.log('=== TEST: All 5 Signals Active ===');

  const results = await search(
    { storage, embedding },
    { query: 'Alex audio engine Rust Sony', tenantId: TENANT, scope: SCOPE, scopeId: SCOPE_ID, limit: 5 },
  );

  if (results.results.length > 0) {
    const top = results.results[0];
    const s = top.signals;

    assert(s.vectorScore > 0, `Vector signal: ${s.vectorScore.toFixed(3)}`);
    assert(s.keywordScore > 0 || results.results.some(r => r.signals.keywordScore > 0), `Keyword signal active`);
    assert(s.graphScore > 0 || results.results.some(r => r.signals.graphScore > 0), `Graph signal active`);
    assert(s.recencyScore > 0, `Recency signal: ${s.recencyScore.toFixed(3)}`);
    assert(s.salienceScore > 0, `Salience signal: ${s.salienceScore.toFixed(3)}`);
  } else {
    assert(false, 'No results returned');
  }
  console.log('');
}

async function testMultiQuery() {
  console.log('=== TEST: Multi-Query Expansion ===');

  // A vague query that benefits from expansion
  const t0 = Date.now();
  const results = await search(
    { storage, embedding },
    { query: 'What did Alex decide recently?', tenantId: TENANT, scope: SCOPE, scopeId: SCOPE_ID, limit: 5 },
  );
  const duration = Date.now() - t0;

  const contents = results.results.map(r => r.fact.content.toLowerCase()).join(' ');
  const hasDecision = contents.includes('rust') || contents.includes('zig') || contents.includes('osaka') || contents.includes('sony');
  assert(hasDecision, `Found a decision in results (${duration}ms)`);
  assert(results.totalCandidates > 5, `Multi-query produced ${results.totalCandidates} candidates (expansion working)`);
  console.log('');
}

async function cleanup() {
  await storage.purgeFacts(TENANT, SCOPE, SCOPE_ID);
  console.log('Cleanup: purged test data\n');
}

async function main() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   STENO PIPELINE END-TO-END TEST     ║');
  console.log('╚══════════════════════════════════════╝\n');

  await setup();
  await testIngestion();
  await testRetrieval();
  await testDedup();
  await testSignals();
  await testMultiQuery();
  await cleanup();

  console.log('══════════════════════════════════════');
  console.log(`  PASSED: ${passed}  FAILED: ${failed}  TOTAL: ${passed + failed}`);
  console.log('══════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });

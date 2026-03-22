/**
 * Riley Brooks Test — Ingest real personal journal data, then ask questions
 * Tests Steno's ability to extract and retrieve personal facts from journals
 */

import { createSupabaseClient, SupabaseStorageAdapter } from '../packages/supabase-adapter/src/index.js';
import { OpenAILLMAdapter } from '../packages/openai-adapter/src/index.js';
import { GeminiEmbeddingAdapter } from '../packages/engine/src/adapters/gemini-embedding.js';
import { InMemoryCacheAdapter } from '../packages/cache-adapter/src/index.js';
import { CachedEmbeddingAdapter } from '../packages/engine/src/retrieval/embedding-cache.js';
import { runExtractionPipeline } from '../packages/engine/src/extraction/pipeline.js';
import { search } from '../packages/engine/src/retrieval/search.js';
import * as fs from 'node:fs';
import { config } from 'dotenv';
config({ path: '.env' });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

// Questions we KNOW the answers to from reading the data
const TEST_QUESTIONS = [
  { q: "What is Riley's partner's name?", a: "Casey", type: "identity" },
  { q: "What project is Riley working on?", a: "LifePath", type: "project" },
  { q: "Where does Riley work?", a: "Brightwell Capital", type: "work" },
  { q: "What course is Riley taking?", a: "NeuroTech Agent Developer", type: "education" },
  { q: "Does Riley plan to propose to Casey?", a: "Yes, he plans to ask her to marry him", type: "relationship" },
  { q: "Who is Jamie and what bothers Riley about him?", a: "Jamie plays video games all day and eats junk food, Riley is annoyed by this", type: "social" },
  { q: "What did Casey say about the diamond earrings?", a: "Casey said Riley should have gotten himself AirPods Max instead of diamond earrings for her", type: "preference" },
  { q: "What board game did Riley and Casey play?", a: "Catan", type: "activity" },
  { q: "Who is Eli?", a: "Tara's (Casey's sister's) new boyfriend", type: "social" },
  { q: "What kind of girls is Riley attracted to besides Casey?", a: "Asian girls", type: "personal" },
];

async function main() {
  console.log('=== RILEY BROOKS MEMORY TEST ===\n');

  // Setup
  const supabase = createSupabaseClient({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });
  const storage = new SupabaseStorageAdapter(supabase);
  const rawEmbedding = new GeminiEmbeddingAdapter({ apiKey: GEMINI_API_KEY });
  const cache = new InMemoryCacheAdapter();
  const embedding = new CachedEmbeddingAdapter(rawEmbedding, cache, 7200);
  const cheapLLM = new OpenAILLMAdapter({ apiKey: OPENAI_API_KEY, model: 'gpt-4.1-nano' });

  // Create tenant
  const tenantId = '00000000-0000-0000-0000-a00000000002';
  try {
    await storage.createTenant({ id: tenantId, name: 'Riley Brooks Test', slug: `riley-${Date.now()}`, plan: 'enterprise' as const });
  } catch {}

  // Load data
  const data = JSON.parse(fs.readFileSync('/Users/sankiii/Downloads/riley_brooks_context.json', 'utf-8'));
  const entries = data.dayEntries || [];

  // Ingest journal entries (batch by date, max 20 entries to save tokens)
  const skipIngest = process.argv.includes('--skip-ingest');
  console.log(`1. ${skipIngest ? 'SKIPPING ingestion (using existing data)' : `Ingesting ${Math.min(entries.length, 30)} journal entries`}...\n`);
  if (skipIngest) { console.log('   (pass without --skip-ingest to re-ingest)\n'); }

  let totalFacts = 0;
  const entriesToIngest = entries.slice(0, 30); // First 30 days (most recent)

  if (skipIngest) { /* skip */ } else for (let i = 0; i < entriesToIngest.length; i++) {
    const entry = entriesToIngest[i];
    const journals = entry.daily?.journalEntries || [];
    const coachSessions = entry.daily?.coachSession || [];

    // Combine all text for this day
    const texts: string[] = [];
    for (const j of journals) {
      if (j.text && j.text.trim().length > 20) {
        texts.push(`[${entry.date}] ${j.text}`);
      }
    }
    for (const c of coachSessions) {
      if (c.summary && c.summary.trim().length > 20) {
        texts.push(`[${entry.date}] Coach session: ${c.summary.slice(0, 2000)}`);
      }
    }

    if (texts.length === 0) continue;

    const combinedText = texts.join('\n\n');

    try {
      const result = await runExtractionPipeline(
        {
          storage, embedding, cheapLLM,
          embeddingModel: 'gemini-embedding-001',
          embeddingDim: 3072,
          extractionTier: 'auto',
        },
        {
          tenantId,
          scope: 'user',
          scopeId: 'riley_brooks',
          inputType: 'raw_text',
          data: combinedText,
        }
      );
      totalFacts += result.factsCreated;
      process.stdout.write(`   [${i + 1}/${entriesToIngest.length}] ${entry.date}: ${result.factsCreated} facts\n`);
    } catch (err) {
      process.stdout.write(`   [${i + 1}/${entriesToIngest.length}] ${entry.date}: ERROR - ${err instanceof Error ? err.message.slice(0, 60) : err}\n`);
    }
  }

  console.log(`\n   Total facts ingested: ${totalFacts}\n`);

  // Now test with questions
  console.log('2. Testing retrieval with known questions...\n');

  let correct = 0;
  let total = TEST_QUESTIONS.length;

  for (const { q, a, type } of TEST_QUESTIONS) {
    try {
      const results = await search(
        { storage, embedding, rerankerLLM: cheapLLM },
        { query: q, tenantId, scope: 'user', scopeId: 'riley_brooks', limit: 20 }
      );

      const context = results.results.map(r => r.fact.content).join('\n');

      // Ask LLM to answer from context
      const answerResp = await cheapLLM.complete([
        { role: 'system', content: 'Answer the question based on the context. IMPORTANT: "User" in the context refers to the person being asked about. So "User loves Casey" means the person in the question loves Casey. Be concise — 1-2 sentences. Only say NOT FOUND if truly nothing relevant.' },
        { role: 'user', content: `Context:\n${context}\n\nQuestion: ${q}` },
      ], { temperature: 0 });

      // Judge
      const judgeResp = await cheapLLM.complete([
        { role: 'system', content: 'Compare the hypothesis to the ground truth. Return JSON: {"correct": true/false, "reason": "brief"}.\n\nRules:\n- Mark CORRECT if the hypothesis contains the key factual information from the ground truth, even if:\n  - It uses different wording\n  - It includes additional context or details\n  - It answers with "yes" when the ground truth is a descriptive answer about the same thing\n- Mark INCORRECT only if:\n  - The hypothesis says "NOT FOUND" or "I don\'t know"\n  - The hypothesis gives a factually WRONG answer (different name, different fact)\n  - The hypothesis completely misses the point of the ground truth' },
        { role: 'user', content: `Ground truth: ${a}\nHypothesis: ${answerResp.content}` },
      ], { temperature: 0, responseFormat: 'json' });

      let isCorrect = false;
      let reason = '';
      try {
        const j = JSON.parse(judgeResp.content);
        isCorrect = j.correct;
        reason = j.reason;
      } catch { reason = 'judge parse failed'; }

      if (isCorrect) correct++;
      console.log(`   ${isCorrect ? '✓' : '✗'} [${type}] ${q}`);
      console.log(`     Answer: ${answerResp.content.slice(0, 100)}`);
      console.log(`     Expected: ${a}`);
      console.log(`     ${reason}\n`);
    } catch (err) {
      console.log(`   ✗ [${type}] ${q} — ERROR: ${err instanceof Error ? err.message.slice(0, 80) : err}\n`);
    }
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`Correct: ${correct}/${total} (${(correct / total * 100).toFixed(1)}%)`);
  console.log(`\nThis tests REAL personal data retrieval, not synthetic benchmarks.`);

  // Skip cleanup — keep data for debugging
  console.log('\nSkipping cleanup — facts preserved for debugging.');
}

main().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});

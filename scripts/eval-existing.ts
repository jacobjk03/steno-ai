/**
 * Evaluate the 5 already-ingested LongMemEval questions
 * Skips ingestion — data already in Supabase from overnight run
 */
import { createSupabaseClient, SupabaseStorageAdapter } from '../packages/supabase-adapter/src/index.js';
import { OpenAILLMAdapter, OpenAIEmbeddingAdapter } from '../packages/openai-adapter/src/index.js';
import { InMemoryCacheAdapter } from '../packages/cache-adapter/src/index.js';
import { CachedEmbeddingAdapter } from '../packages/engine/src/retrieval/embedding-cache.js';
import { search } from '../packages/engine/src/retrieval/search.js';
import * as fs from 'node:fs';
import { config } from 'dotenv';
config({ path: '.env' });

// The 5 ingested question IDs from overnight
const INGESTED_IDS = ['118b2229', '1e043500', '51a45a95', '58bf7951', 'e47becba'];

async function main() {
  console.log('=== LONGMEMEVAL — EVALUATE 5 INGESTED QUESTIONS ===\n');

  const supabase = createSupabaseClient({ url: process.env.SUPABASE_URL!, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY! });
  const storage = new SupabaseStorageAdapter(supabase);
  const rawEmbedding = new OpenAIEmbeddingAdapter({ apiKey: process.env.OPENAI_API_KEY!, model: 'text-embedding-3-large', dimensions: 3072 });
  const cache = new InMemoryCacheAdapter();
  const embedding = new CachedEmbeddingAdapter(rawEmbedding, cache, 7200);
  const cheapLLM = new OpenAILLMAdapter({ apiKey: process.env.OPENAI_API_KEY!, model: 'gpt-4.1-nano' });
  const judgeLLM = new OpenAILLMAdapter({ apiKey: process.env.OPENAI_API_KEY!, model: 'gpt-4o' });
  const tenantId = '00000000-0000-0000-0000-b00000000001';

  // Load questions from the dataset
  const dataDir = '/Volumes/ExtSSD/WebProjects/steno-memorybench/data/benchmarks/longmemeval/datasets/questions';

  let correct = 0;
  let total = 0;
  const results: Array<{ id: string; type: string; question: string; answer: string; hypothesis: string; correct: boolean; reason: string }> = [];

  for (const qId of INGESTED_IDS) {
    const qFile = `${dataDir}/${qId}.json`;
    if (!fs.existsSync(qFile)) { console.log(`Skip ${qId} — file not found`); continue; }

    const q = JSON.parse(fs.readFileSync(qFile, 'utf-8'));
    const scopeId = `${qId}-run-20260322-100948`;
    total++;

    console.log(`[${total}/5] ${q.question_type}: ${q.question.slice(0, 60)}...`);

    // Search
    const searchStart = Date.now();
    const searchResults = await search(
      { storage, embedding, rerankerLLM: cheapLLM },
      { query: q.question, tenantId, scope: 'user', scopeId, limit: 20 }
    );
    const searchMs = Date.now() - searchStart;

    const context = searchResults.results.map((r: any) => r.fact.content).join('\n');
    console.log(`   Search: ${searchResults.results.length} results in ${searchMs}ms`);

    // Answer — with User = person fix
    const answerResp = await cheapLLM.complete([
      { role: 'system', content: 'Answer the question based on the context. "User" in the context refers to the person being asked about. Extract specific names, dates, numbers. Be concise — 1-2 sentences. Only say "I don\'t know" if truly nothing relevant.' },
      { role: 'user', content: `Context:\n${context}\n\nQuestion: ${q.question}` },
    ], { temperature: 0 });

    console.log(`   Answer: ${answerResp.content.slice(0, 100)}`);
    console.log(`   Ground truth: ${q.answer.slice(0, 100)}`);

    // Judge with GPT-4o
    const judgeResp = await judgeLLM.complete([
      { role: 'system', content: 'Compare hypothesis to ground truth. Return JSON: {"correct": true/false, "reason": "brief"}. Correct if key facts match even with different wording. Incorrect only if factually wrong or says "I don\'t know" when answer exists.' },
      { role: 'user', content: `Ground truth: ${q.answer}\nHypothesis: ${answerResp.content}` },
    ], { temperature: 0, responseFormat: 'json' });

    let isCorrect = false;
    let reason = '';
    try {
      const j = JSON.parse(judgeResp.content);
      isCorrect = j.correct;
      reason = j.reason;
    } catch { reason = 'judge parse failed'; }

    if (isCorrect) correct++;
    console.log(`   ${isCorrect ? '✓ CORRECT' : '✗ INCORRECT'}: ${reason.slice(0, 80)}\n`);

    results.push({
      id: q.question_id, type: q.question_type,
      question: q.question, answer: q.answer,
      hypothesis: answerResp.content, correct: isCorrect, reason,
    });
  }

  console.log('=== RESULTS ===');
  console.log(`Correct: ${correct}/${total} (${(correct / total * 100).toFixed(1)}%)`);

  // Per-type
  const types = [...new Set(results.map(r => r.type))];
  for (const t of types) {
    const tr = results.filter(r => r.type === t);
    const tc = tr.filter(r => r.correct).length;
    console.log(`  ${t}: ${tc}/${tr.length}`);
  }

  console.log('\n=== COMPETITOR COMPARISON ===');
  console.log(`Steno:        ${(correct / total * 100).toFixed(1)}%`);
  console.log(`Supermemory:  85.2% (production) / 98.6% (experimental)`);
  console.log(`Mastra:       94.87%`);
  console.log(`Letta:        90.4%`);
  console.log(`EmergenceMem: 86.0%`);
  console.log(`Zep:          71.2%`);

  fs.writeFileSync('scripts/benchmark/eval-results.json', JSON.stringify(results, null, 2));
}

main().catch(err => { console.error('FAILED:', err); process.exit(1); });

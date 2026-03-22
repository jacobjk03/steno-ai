/**
 * Steno LongMemEval Benchmark Harness
 *
 * Runs the LongMemEval benchmark against Steno:
 * 1. For each question, ingest its conversation history into Steno
 * 2. Search with the question
 * 3. Use LLM to generate an answer from retrieved context
 * 4. Score against ground truth using LLM-as-judge
 *
 * Usage:
 *   npx tsx scripts/benchmark/run-longmemeval.ts --limit 10  # test run
 *   npx tsx scripts/benchmark/run-longmemeval.ts              # full run
 */

import { createSupabaseClient, SupabaseStorageAdapter } from '../../packages/supabase-adapter/src/index.js';
import { OpenAILLMAdapter, OpenAIEmbeddingAdapter } from '../../packages/openai-adapter/src/index.js';
import { InMemoryCacheAdapter } from '../../packages/cache-adapter/src/index.js';
import { runExtractionPipeline } from '../../packages/engine/src/extraction/pipeline.js';
import { search } from '../../packages/engine/src/retrieval/search.js';
import { CachedEmbeddingAdapter } from '../../packages/engine/src/retrieval/embedding-cache.js';
import * as fs from 'node:fs';
import { config } from 'dotenv';
config({ path: '.env' });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

interface LongMemEvalQuestion {
  question_id: string;
  question_type: string;
  question: string;
  answer: string;
  question_date: string;
  haystack_dates: string[];
  haystack_session_ids: string[];
  haystack_sessions: Array<Array<{ role: string; content: string; has_answer?: boolean }>>;
  answer_session_ids: string[];
}

interface BenchmarkResult {
  question_id: string;
  question_type: string;
  question: string;
  ground_truth: string;
  hypothesis: string;
  retrieved_facts: string[];
  retrieval_time_ms: number;
  extraction_time_ms: number;
  correct: boolean | null; // null = not yet judged
  judge_reasoning: string;
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]!, 10) : 500;
  const skipIngest = args.includes('--skip-ingest');

  console.log('=== STENO LONGMEMEVAL BENCHMARK ===\n');
  console.log(`Questions to evaluate: ${limit}`);

  // Load dataset
  const dataset: LongMemEvalQuestion[] = JSON.parse(
    fs.readFileSync('scripts/benchmark/data/longmemeval_oracle.json', 'utf-8')
  );
  const questions = dataset.slice(0, limit);

  // Create adapters
  const supabase = createSupabaseClient({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });
  const storage = new SupabaseStorageAdapter(supabase);
  const rawEmbedding = new OpenAIEmbeddingAdapter({ apiKey: OPENAI_API_KEY, model: 'text-embedding-3-small', dimensions: 1536 });
  const cache = new InMemoryCacheAdapter();
  const embedding = new CachedEmbeddingAdapter(rawEmbedding, cache, 7200);
  const cheapLLM = new OpenAILLMAdapter({ apiKey: OPENAI_API_KEY, model: 'gpt-4.1-nano' });
  const judgeLLM = new OpenAILLMAdapter({ apiKey: OPENAI_API_KEY, model: 'gpt-4.1-nano' });

  // Create benchmark tenant
  const tenantId = '00000000-0000-0000-0000-b00000000001';
  try {
    await storage.createTenant({ id: tenantId, name: 'LongMemEval Benchmark', slug: `longmemeval-${Date.now()}`, plan: 'enterprise' as const });
  } catch { /* tenant may already exist */ }

  const results: BenchmarkResult[] = [];
  const startTime = Date.now();

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]!;
    const scopeId = `q_${q.question_id}`;
    console.log(`\n[${i + 1}/${questions.length}] ${q.question_type}: ${q.question.slice(0, 60)}...`);

    try {
      // Step 1: Ingest conversation history
      if (!skipIngest) {
        const ingestStart = Date.now();
        for (const session of q.haystack_sessions) {
          await runExtractionPipeline(
            {
              storage, embedding, cheapLLM,
              embeddingModel: 'text-embedding-3-small',
              embeddingDim: 1536,
              extractionTier: 'auto',
            },
            {
              tenantId,
              scope: 'user',
              scopeId,
              inputType: 'conversation',
              data: { messages: session },
            }
          );
        }
        const ingestMs = Date.now() - ingestStart;
        console.log(`   Ingested ${q.haystack_sessions.length} sessions in ${ingestMs}ms`);
      }

      // Step 2: Search with the question
      const searchStart = Date.now();
      const searchResults = await search(
        { storage, embedding },
        {
          query: q.question,
          tenantId,
          scope: 'user',
          scopeId,
          limit: 10,
        }
      );
      const searchMs = Date.now() - searchStart;

      const retrievedFacts = searchResults.results.map(r => r.fact.content);
      console.log(`   Retrieved ${retrievedFacts.length} facts in ${searchMs}ms`);

      // Step 3: Generate answer from retrieved context
      const context = retrievedFacts.join('\n');
      const answerResponse = await cheapLLM.complete([
        {
          role: 'system',
          content: 'Answer the question based on the provided context. Extract the specific answer from the context — look for exact names, dates, numbers, events, and details. If multiple pieces of context are relevant, synthesize them. Be concise — answer in 1-2 sentences. Only say "I don\'t know" if the context is truly completely irrelevant.',
        },
        {
          role: 'user',
          content: `Context:\n${context}\n\nQuestion: ${q.question}`,
        },
      ], { temperature: 0 });

      const hypothesis = answerResponse.content;
      console.log(`   Answer: ${hypothesis.slice(0, 80)}...`);
      console.log(`   Ground truth: ${q.answer.slice(0, 80)}...`);

      // Step 4: Judge correctness using LLM
      const judgeResponse = await judgeLLM.complete([
        {
          role: 'system',
          content: `You are a strict evaluator. Compare the HYPOTHESIS answer against the GROUND TRUTH answer.
Return JSON: {"correct": true/false, "reasoning": "brief explanation"}
Mark as correct if the hypothesis captures the key information from the ground truth, even if worded differently.
Mark as incorrect if the hypothesis is wrong, incomplete in a material way, or says "I don't know" when the answer exists.`,
        },
        {
          role: 'user',
          content: `GROUND TRUTH: ${q.answer}\nHYPOTHESIS: ${hypothesis}`,
        },
      ], { temperature: 0, responseFormat: 'json' });

      let correct: boolean | null = null;
      let reasoning = '';
      try {
        const judgeResult = JSON.parse(judgeResponse.content);
        correct = judgeResult.correct;
        reasoning = judgeResult.reasoning;
      } catch {
        reasoning = 'Failed to parse judge response';
      }

      console.log(`   ${correct ? '✓ CORRECT' : '✗ INCORRECT'}: ${reasoning.slice(0, 60)}`);

      results.push({
        question_id: q.question_id,
        question_type: q.question_type,
        question: q.question,
        ground_truth: q.answer,
        hypothesis,
        retrieved_facts: retrievedFacts,
        retrieval_time_ms: searchMs,
        extraction_time_ms: 0,
        correct,
        judge_reasoning: reasoning,
      });

    } catch (err) {
      console.log(`   ✗ ERROR: ${err instanceof Error ? err.message : String(err)}`);
      results.push({
        question_id: q.question_id,
        question_type: q.question_type,
        question: q.question,
        ground_truth: q.answer,
        hypothesis: '',
        retrieved_facts: [],
        retrieval_time_ms: 0,
        extraction_time_ms: 0,
        correct: false,
        judge_reasoning: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // Save progress every 10 questions
    if ((i + 1) % 10 === 0 || i === questions.length - 1) {
      fs.writeFileSync('scripts/benchmark/results.json', JSON.stringify(results, null, 2));
    }
  }

  // Final stats
  const totalMs = Date.now() - startTime;
  const correct = results.filter(r => r.correct === true).length;
  const incorrect = results.filter(r => r.correct === false).length;
  const errors = results.filter(r => r.correct === null).length;
  const total = results.length;

  console.log('\n=== LONGMEMEVAL RESULTS ===\n');
  console.log(`Total questions: ${total}`);
  console.log(`Correct: ${correct} (${(correct / total * 100).toFixed(1)}%)`);
  console.log(`Incorrect: ${incorrect} (${(incorrect / total * 100).toFixed(1)}%)`);
  console.log(`Errors: ${errors}`);
  console.log(`Total time: ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`Avg retrieval time: ${(results.reduce((s, r) => s + r.retrieval_time_ms, 0) / total).toFixed(0)}ms`);

  // Per-type breakdown
  const types = [...new Set(results.map(r => r.question_type))];
  console.log('\nPer-type accuracy:');
  for (const type of types) {
    const typeResults = results.filter(r => r.question_type === type);
    const typeCorrect = typeResults.filter(r => r.correct === true).length;
    console.log(`  ${type}: ${typeCorrect}/${typeResults.length} (${(typeCorrect / typeResults.length * 100).toFixed(1)}%)`);
  }

  // Competitor comparison
  console.log('\n=== COMPETITOR COMPARISON ===');
  console.log(`Steno:        ${(correct / total * 100).toFixed(1)}%`);
  console.log(`HydraDB:      ~90% (claimed)`);
  console.log(`Zep:          ~85%`);
  console.log(`Supermemory:  ~85% (self-reported) / ~70% (independent)`);
  console.log(`Letta/MemGPT: ~83%`);
  console.log(`Mem0:         ~66% (self-reported) / ~58% (independent)`);

  fs.writeFileSync('scripts/benchmark/results.json', JSON.stringify(results, null, 2));
  console.log('\nResults saved to scripts/benchmark/results.json');
}

main().catch((err) => {
  console.error('\n❌ BENCHMARK FAILED:', err);
  process.exit(1);
});

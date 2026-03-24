/**
 * Targeted test — small focused dataset to verify extraction + retrieval quality
 */
import { createSupabaseClient, SupabaseStorageAdapter } from '../packages/supabase-adapter/src/index.js';
import { OpenAILLMAdapter } from '../packages/openai-adapter/src/index.js';
import { PerplexityEmbeddingAdapter } from '../packages/engine/src/adapters/perplexity-embedding.js';
import { InMemoryCacheAdapter } from '../packages/cache-adapter/src/index.js';
import { CachedEmbeddingAdapter } from '../packages/engine/src/retrieval/embedding-cache.js';
import { runExtractionPipeline } from '../packages/engine/src/extraction/pipeline.js';
import { search } from '../packages/engine/src/retrieval/search.js';
import * as fs from 'node:fs';
import { config } from 'dotenv';
config({ path: '.env' });

const testData = JSON.parse(fs.readFileSync('./scripts/targeted-test.json', 'utf-8'));
const tenantId = '00000000-0000-0000-0000-a00000000002'; // use existing Riley tenant

async function main() {
  const supabase = createSupabaseClient({ url: process.env.SUPABASE_URL!, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY! });
  const storage = new SupabaseStorageAdapter(supabase);
  const rawEmbedding = new PerplexityEmbeddingAdapter({ apiKey: process.env.PERPLEXITY_API_KEY!, model: 'pplx-embed-v1-4b', dimensions: 2000 });
  const cache = new InMemoryCacheAdapter();
  const embedding = new CachedEmbeddingAdapter(rawEmbedding, cache, 7200);
  const cheapLLM = new OpenAILLMAdapter({ apiKey: process.env.OPENAI_API_KEY!, model: 'gpt-5.4-mini' });

  // Using existing tenant from Riley test

  // Purge old data
  await storage.purgeFacts(tenantId, 'user', 'targeted_test');
  console.log('=== TARGETED TEST ===\n');

  // 1. Ingest
  console.log('1. Ingesting entries...');
  for (let i = 0; i < testData.entries.length; i++) {
    const entry = testData.entries[i];
    try {
      const result = await runExtractionPipeline(
        { storage, embedding, cheapLLM, embeddingModel: 'pplx-embed-v1-4b', embeddingDim: 2000 },
        { tenantId, scope: 'user', scopeId: 'targeted_test', inputType: 'raw_text', data: entry.content },
      );
      console.log(`   [${i + 1}/${testData.entries.length}] ${entry.date}: ${result.factsCreated} facts, ${result.edgesCreated} edges`);
    } catch (e) {
      console.log(`   [${i + 1}/${testData.entries.length}] ${entry.date}: ERROR - ${e instanceof Error ? e.message.slice(0, 80) : e}`);
    }
  }

  // 2. Check DB state
  const { data: entities } = await supabase.from('entities').select('canonical_name, entity_type').eq('tenant_id', tenantId);
  const { data: edges } = await supabase.from('edges').select('id').eq('tenant_id', tenantId);
  const { data: facts } = await supabase.from('facts').select('id').eq('tenant_id', tenantId).eq('source_type', 'conversation');
  console.log(`\n   DB: ${facts?.length ?? 0} facts, ${entities?.length ?? 0} entities, ${edges?.length ?? 0} edges`);
  console.log(`   Entities: ${(entities ?? []).map(e => `${e.canonical_name}(${e.entity_type})`).join(', ')}`);

  // 3. Test retrieval
  console.log('\n2. Testing retrieval...\n');
  let correct = 0;
  for (const { q, a } of testData.questions) {
    try {
      const results = await search(
        { storage, embedding, rerankerLLM: cheapLLM },
        { query: q, tenantId, scope: 'user', scopeId: 'targeted_test', limit: 10 }
      );
      const context = results.results.map(r => r.fact.content).join('\n');

      const answer = await cheapLLM.complete([
        { role: 'system', content: 'You are answering questions about a person. "User" refers to this person. Answer based ONLY on the context. Be concise. Say NOT FOUND if the context truly has no relevant info.' },
        { role: 'user', content: `Context:\n${context}\n\nQuestion: ${q}` },
      ], { temperature: 0 });

      // Simple judge
      const judge = await cheapLLM.complete([
        { role: 'system', content: `You are a lenient factual judge. Return JSON: {"correct": true/false, "reason": "..."}

Rules:
- If the hypothesis captures the SAME core meaning as the ground truth, mark correct even if wording differs
- "Casey said get AirPods Max instead of earrings" matches "should have gotten himself AirPods Max instead of diamond earrings" — CORRECT
- "Jamie plays video games and eats junk food" matches "played video games for 5 hours eating Doritos and pizza" — CORRECT
- Only mark incorrect if the hypothesis has factually WRONG information or says NOT FOUND when the ground truth has an answer` },
        { role: 'user', content: `Ground truth: ${a}\nHypothesis: ${answer.content}\n\nDoes the hypothesis capture the same core meaning as the ground truth?` },
      ], { temperature: 0, responseFormat: 'json' });

      const judgeResult = JSON.parse(judge.content);
      const pass = judgeResult.correct === true;
      if (pass) correct++;

      console.log(`   ${pass ? '✓' : '✗'} ${q}`);
      console.log(`     Answer: ${answer.content.slice(0, 100)}`);
      if (!pass) {
        console.log(`     Expected: ${a}`);
        // Show top 3 search results for debugging
        console.log(`     Top results:`);
        for (const r of results.results.slice(0, 3)) {
          console.log(`       [${r.score.toFixed(3)}] ${r.fact.content.slice(0, 80)}`);
        }
      }
    } catch (e) {
      console.log(`   ✗ ${q}: ERROR - ${e instanceof Error ? e.message.slice(0, 80) : e}`);
    }
  }

  console.log(`\n=== RESULTS: ${correct}/${testData.questions.length} (${(100 * correct / testData.questions.length).toFixed(1)}%) ===`);
}
main().catch(console.error);

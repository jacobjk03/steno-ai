/**
 * Trace EXACTLY where search results disappear in the pipeline
 */
import { createSupabaseClient, SupabaseStorageAdapter } from '../packages/supabase-adapter/src/index.js';
import { OpenAILLMAdapter, OpenAIEmbeddingAdapter } from '../packages/openai-adapter/src/index.js';
import { search } from '../packages/engine/src/retrieval/search.js';
import { config } from 'dotenv';
config({ path: '.env' });

async function main() {
  const supabase = createSupabaseClient({ url: process.env.SUPABASE_URL!, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY! });
  const storage = new SupabaseStorageAdapter(supabase);
  const embedding = new OpenAIEmbeddingAdapter({ apiKey: process.env.OPENAI_API_KEY! });
  const cheapLLM = new OpenAILLMAdapter({ apiKey: process.env.OPENAI_API_KEY!, model: 'gpt-4.1-nano' });
  const tenantId = '00000000-0000-0000-0000-a00000000002';

  // Step 1: Direct vector search (bypass everything)
  console.log('=== STEP 1: Direct vector search ===');
  const qEmb = await embedding.embed("What board game did Riley play?");
  const vectorResults = await storage.vectorSearch({
    embedding: qEmb, tenantId, scope: 'user', scopeId: 'riley_brooks',
    limit: 5, minSimilarity: 0, validOnly: true,
  });
  console.log(`Vector results: ${vectorResults.length}`);
  for (const r of vectorResults) console.log(`  [${r.similarity.toFixed(3)}] ${r.fact.content.slice(0, 80)}`);

  // Step 2: Compound search
  console.log('\n=== STEP 2: Compound search ===');
  const compoundResults = await storage.compoundSearch({
    embedding: qEmb, query: "board game Riley play",
    tenantId, scope: 'user', scopeId: 'riley_brooks', limit: 20,
  });
  console.log(`Compound results: ${compoundResults.length}`);
  for (const r of compoundResults.slice(0, 5)) console.log(`  [${r.source} ${r.relevanceScore.toFixed(3)}] ${(r.fact as any).content?.slice(0, 80) || JSON.stringify(r.fact).slice(0, 80)}`);

  // Step 3: Full search (no reranker)
  console.log('\n=== STEP 3: Full search (NO reranker) ===');
  const searchResults = await search(
    { storage, embedding },
    { query: "What board game did Riley play?", tenantId, scope: 'user', scopeId: 'riley_brooks', limit: 20 }
  );
  console.log(`Search results: ${searchResults.results.length}, candidates: ${searchResults.totalCandidates}`);
  for (const r of searchResults.results.slice(0, 5)) console.log(`  [${r.score.toFixed(3)}] ${r.fact.content.slice(0, 80)}`);

  // Step 4: Full search WITH reranker
  console.log('\n=== STEP 4: Full search (WITH reranker) ===');
  const rerankedResults = await search(
    { storage, embedding, rerankerLLM: cheapLLM },
    { query: "What board game did Riley play?", tenantId, scope: 'user', scopeId: 'riley_brooks', limit: 20 }
  );
  console.log(`Reranked results: ${rerankedResults.results.length}, candidates: ${rerankedResults.totalCandidates}`);
  for (const r of rerankedResults.results.slice(0, 5)) console.log(`  [${r.score.toFixed(3)}] ${r.fact.content.slice(0, 80)}`);

  // Step 5: Answer from the context
  console.log('\n=== STEP 5: Answer generation ===');
  const context = rerankedResults.results.map(r => r.fact.content).join('\n');
  console.log(`Context length: ${context.length} chars, ${rerankedResults.results.length} facts`);
  console.log(`First 3 facts in context:`);
  for (const r of rerankedResults.results.slice(0, 3)) console.log(`  - ${r.fact.content.slice(0, 100)}`);

  const answer = await cheapLLM.complete([
    { role: 'system', content: 'Answer the question based on the context. Be concise.' },
    { role: 'user', content: `Context:\n${context}\n\nQuestion: What board game did Riley play?` },
  ], { temperature: 0 });
  console.log(`\nAnswer: ${answer.content}`);
}

main().catch(console.error);

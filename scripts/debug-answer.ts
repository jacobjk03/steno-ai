import { createSupabaseClient, SupabaseStorageAdapter } from '../packages/supabase-adapter/src/index.js';
import { OpenAILLMAdapter } from '../packages/openai-adapter/src/index.js';
import { GeminiEmbeddingAdapter } from '../packages/engine/src/adapters/gemini-embedding.js';
import { search } from '../packages/engine/src/retrieval/search.js';
import { config } from 'dotenv';
config({ path: '.env' });

async function main() {
  const supabase = createSupabaseClient({ url: process.env.SUPABASE_URL!, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY! });
  const storage = new SupabaseStorageAdapter(supabase);
  const embedding = new GeminiEmbeddingAdapter({ apiKey: process.env.GEMINI_API_KEY! });
  const cheapLLM = new OpenAILLMAdapter({ apiKey: process.env.OPENAI_API_KEY!, model: 'gpt-4.1-nano' });
  const tenantId = '00000000-0000-0000-0000-a00000000002';

  // Test: partner's name
  console.log('=== TRACING: "What is Riley\'s partner\'s name?" ===\n');

  const results = await search(
    { storage, embedding, rerankerLLM: cheapLLM },
    { query: "What is Riley's partner's name?", tenantId, scope: 'user', scopeId: 'riley_brooks', limit: 20 }
  );

  console.log(`Results: ${results.results.length}`);
  console.log('\nTop 10 facts sent to answer LLM:');
  for (const r of results.results.slice(0, 10)) {
    console.log(`  [${r.score.toFixed(3)}] ${r.fact.content.slice(0, 100)}`);
  }

  const context = results.results.map(r => r.fact.content).join('\n');
  console.log(`\nContext length: ${context.length} chars`);
  console.log(`Contains "Casey": ${context.includes('Casey')}`);
  console.log(`Contains "partner": ${context.includes('partner')}`);
  console.log(`Contains "love": ${context.includes('love') || context.includes('Love')}`);

  // Now ask the answer LLM
  const answer = await cheapLLM.complete([
    { role: 'system', content: 'Answer the question based on the context. IMPORTANT: "User" in the context refers to the person being asked about. So "User loves Casey" = "Riley loves Casey". Be concise.' },
    { role: 'user', content: `Context:\n${context}\n\nQuestion: What is Riley's partner's name?` },
  ], { temperature: 0 });

  console.log(`\nAnswer: ${answer.content}`);
}
main().catch(console.error);

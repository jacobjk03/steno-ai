import { createSupabaseClient, SupabaseStorageAdapter } from '../packages/supabase-adapter/src/index.js';
import { OpenAILLMAdapter, OpenAIEmbeddingAdapter } from '../packages/openai-adapter/src/index.js';
import { search } from '../packages/engine/src/retrieval/search.js';
import { config } from 'dotenv';
config({ path: '.env' });

async function main() {
  const supabase = createSupabaseClient({ url: process.env.SUPABASE_URL!, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY! });
  const storage = new SupabaseStorageAdapter(supabase);
  const embedding = new OpenAIEmbeddingAdapter({ apiKey: process.env.OPENAI_API_KEY!, model: 'text-embedding-3-large', dimensions: 3072 });
  const cheapLLM = new OpenAILLMAdapter({ apiKey: process.env.OPENAI_API_KEY!, model: 'gpt-4.1-nano' });

  const query = "Where did I redeem a $5 coupon on coffee creamer?";
  const tenantId = '00000000-0000-0000-0000-b00000000001';
  const scopeId = '51a45a95-run-20260322-100948';

  // Search WITHOUT reranker
  console.log('=== WITHOUT RERANKER ===');
  const noRerank = await search(
    { storage, embedding },
    { query, tenantId, scope: 'user', scopeId, limit: 20 }
  );
  for (const r of noRerank.results.slice(0, 10)) {
    const hasTarget = r.fact.content.toLowerCase().includes('target');
    console.log(`  ${hasTarget ? '>>>' : '   '} [${r.score.toFixed(3)}] ${r.fact.content.slice(0, 100)}`);
  }

  // Search WITH reranker
  console.log('\n=== WITH RERANKER ===');
  const withRerank = await search(
    { storage, embedding, rerankerLLM: cheapLLM },
    { query, tenantId, scope: 'user', scopeId, limit: 20 }
  );
  for (const r of withRerank.results.slice(0, 10)) {
    const hasTarget = r.fact.content.toLowerCase().includes('target');
    console.log(`  ${hasTarget ? '>>>' : '   '} [${r.score.toFixed(3)}] ${r.fact.content.slice(0, 100)}`);
  }

  // Now answer with the reranked context
  const context = withRerank.results.map(r => r.fact.content).join('\n');
  console.log(`\nContext contains "Target": ${context.toLowerCase().includes('target')}`);

  const answer = await cheapLLM.complete([
    { role: 'system', content: 'Answer the question. "User" = the person asked about. Extract specific names, places, stores. Be precise.' },
    { role: 'user', content: `Context:\n${context}\n\nQuestion: ${query}` },
  ], { temperature: 0 });
  console.log(`\nAnswer: ${answer.content}`);
}
main().catch(console.error);

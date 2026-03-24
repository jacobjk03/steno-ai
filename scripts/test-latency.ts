import { createSupabaseClient, SupabaseStorageAdapter } from '../packages/supabase-adapter/src/index.js';
import { OpenAILLMAdapter } from '../packages/openai-adapter/src/index.js';
import { PerplexityEmbeddingAdapter } from '../packages/engine/src/adapters/perplexity-embedding.js';
import { search } from '../packages/engine/src/retrieval/search.js';
import { config } from 'dotenv';
config({ path: '.env' });

// Use the LoCoMo data that was just ingested
const tenantId = '00000000-0000-0000-0000-b00000000001';

async function main() {
  const supabase = createSupabaseClient({ url: process.env.SUPABASE_URL!, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY! });
  const storage = new SupabaseStorageAdapter(supabase);
  const embedding = new PerplexityEmbeddingAdapter({ apiKey: process.env.PERPLEXITY_API_KEY!, model: 'pplx-embed-v1-4b', dimensions: 2000 });

  const t0 = Date.now();
  const results = await search(
    { storage, embedding, rerank: false },
    { query: 'When did Caroline go to the LGBTQ support group?', tenantId, scope: 'user', scopeId: 'conv-26-q0-run-20260324-080153', limit: 10 }
  );
  console.log(`\nTotal search: ${Date.now() - t0}ms, results: ${results.results.length}`);
  for (const r of results.results.slice(0, 3)) {
    console.log(`  [${r.score.toFixed(3)}] ${r.fact.content.slice(0, 80)}`);
  }
}
main().catch(console.error);

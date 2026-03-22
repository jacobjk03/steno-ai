import { createSupabaseClient, SupabaseStorageAdapter } from '../packages/supabase-adapter/src/index.js';
import { OpenAIEmbeddingAdapter } from '../packages/openai-adapter/src/index.js';
import { search } from '../packages/engine/src/retrieval/search.js';
import { config } from 'dotenv';
config({ path: '.env' });

async function main() {
  const supabase = createSupabaseClient({ url: process.env.SUPABASE_URL!, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY! });
  const storage = new SupabaseStorageAdapter(supabase);
  const embedding = new OpenAIEmbeddingAdapter({ apiKey: process.env.OPENAI_API_KEY!, model: 'text-embedding-3-large', dimensions: 3072 });

  const results = await search(
    { storage, embedding },
    { query: "Where did I redeem a $5 coupon on coffee creamer?", tenantId: '00000000-0000-0000-0000-b00000000001', scope: 'user', scopeId: '51a45a95-run-20260322-100948', limit: 20 }
  );

  console.log('Search results for coupon question:');
  for (const r of results.results.slice(0, 10)) {
    const hasTarget = r.fact.content.toLowerCase().includes('target');
    console.log(`  ${hasTarget ? '>>> ' : '    '}[${r.score.toFixed(3)}] ${r.fact.content.slice(0, 120)}`);
  }

  // Also check if Target exists in DB at all
  const { data } = await supabase.from('facts')
    .select('content')
    .eq('tenant_id', '00000000-0000-0000-0000-b00000000001')
    .eq('scope_id', '51a45a95-run-20260322-100948')
    .ilike('content', '%target%')
    .limit(5);
  console.log(`\nFacts containing "Target": ${data?.length ?? 0}`);
  for (const f of (data ?? [])) console.log(`  - ${(f as any).content.slice(0, 120)}`);
}
main().catch(console.error);

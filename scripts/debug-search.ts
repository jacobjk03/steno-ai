import { createSupabaseClient, SupabaseStorageAdapter } from '../packages/supabase-adapter/src/index.js';
import { OpenAIEmbeddingAdapter } from '../packages/openai-adapter/src/index.js';
import { search } from '../packages/engine/src/retrieval/search.js';
import { config } from 'dotenv';
config({ path: '.env' });

async function main() {
  const supabase = createSupabaseClient({ url: process.env.SUPABASE_URL!, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY! });
  const storage = new SupabaseStorageAdapter(supabase);
  const embedding = new OpenAIEmbeddingAdapter({ apiKey: process.env.OPENAI_API_KEY! });
  const tenantId = '00000000-0000-0000-0000-a00000000002';

  // First check: do facts exist?
  const facts = await storage.getFactsByScope(tenantId, 'user', 'riley_brooks', { limit: 5 });
  console.log(`Facts in DB for riley_brooks: ${facts.data.length}`);
  if (facts.data.length > 0) {
    for (const f of facts.data.slice(0, 3)) console.log(`  - ${f.content.slice(0, 80)}`);
  }

  // Direct vector search
  console.log('\n--- Direct vector search for "Casey partner" ---');
  const queryEmb = await embedding.embed("What is Riley's partner's name?");
  const vectorResults = await storage.vectorSearch({
    embedding: queryEmb, tenantId, scope: 'user', scopeId: 'riley_brooks',
    limit: 5, minSimilarity: 0, validOnly: true,
  });
  console.log(`Vector results: ${vectorResults.length}`);
  for (const r of vectorResults) {
    console.log(`  [${r.similarity.toFixed(3)}] ${r.fact.content.slice(0, 80)}`);
  }

  // Full search
  console.log('\n--- Full search for "partner name" ---');
  const results = await search(
    { storage, embedding },
    { query: "What is Riley's partner's name?", tenantId, scope: 'user', scopeId: 'riley_brooks', limit: 5 }
  );
  console.log(`Search results: ${results.results.length}, candidates: ${results.totalCandidates}`);
  for (const r of results.results) {
    console.log(`  [${r.score.toFixed(3)}] ${r.fact.content.slice(0, 80)}`);
  }
}

main().catch(console.error);

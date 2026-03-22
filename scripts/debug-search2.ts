import { createSupabaseClient, SupabaseStorageAdapter } from '../packages/supabase-adapter/src/index.js';
import { OpenAIEmbeddingAdapter } from '../packages/openai-adapter/src/index.js';
import { config } from 'dotenv';
config({ path: '.env' });

async function main() {
  const supabase = createSupabaseClient({ url: process.env.SUPABASE_URL!, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY! });
  const storage = new SupabaseStorageAdapter(supabase);
  const embedding = new OpenAIEmbeddingAdapter({ apiKey: process.env.OPENAI_API_KEY! });
  const tenantId = '00000000-0000-0000-0000-a00000000002';

  // Direct compound search
  const queryEmb = await embedding.embed("What is Riley's partner's name?");

  console.log('--- Compound search (vector + keyword) ---');
  const results = await storage.compoundSearch({
    embedding: queryEmb,
    query: "Riley partner name Casey girlfriend",
    tenantId,
    scope: 'user',
    scopeId: 'riley_brooks',
    limit: 20,
  });

  console.log(`Results: ${results.length}`);
  for (const r of results.slice(0, 10)) {
    console.log(`  [${r.source} ${r.relevanceScore.toFixed(3)}] ${r.fact.content.slice(0, 100)}`);
  }

  // Direct vector search (bypass compound)
  console.log('\n--- Direct vector search ---');
  const vectorResults = await storage.vectorSearch({
    embedding: queryEmb,
    tenantId,
    scope: 'user',
    scopeId: 'riley_brooks',
    limit: 20,
    minSimilarity: 0,
    validOnly: true,
  });

  console.log(`Results: ${vectorResults.length}`);
  for (const r of vectorResults.slice(0, 10)) {
    console.log(`  [${r.similarity.toFixed(3)}] ${r.fact.content.slice(0, 100)}`);
  }
}

main().catch(console.error);

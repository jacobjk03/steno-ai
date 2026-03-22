import { createSupabaseClient, SupabaseStorageAdapter } from '../packages/supabase-adapter/src/index.js';
import { GeminiEmbeddingAdapter } from '../packages/engine/src/adapters/gemini-embedding.js';
import { config } from 'dotenv';
config({ path: '.env' });

async function main() {
  const supabase = createSupabaseClient({ url: process.env.SUPABASE_URL!, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY! });
  const storage = new SupabaseStorageAdapter(supabase);
  const embedding = new GeminiEmbeddingAdapter({ apiKey: process.env.GEMINI_API_KEY! });
  const tenantId = '00000000-0000-0000-0000-a00000000002';

  const queries = [
    "What is Riley's partner's name?",
    "Where does Riley work?",
    "What course is Riley taking?",
    "What kind of girls is Riley attracted to?",
    "Does Riley plan to propose?",
  ];

  for (const q of queries) {
    console.log(`\n--- "${q}" ---`);
    const qEmb = await embedding.embed(q);
    const results = await storage.vectorSearch({
      embedding: qEmb, tenantId, scope: 'user', scopeId: 'riley_brooks',
      limit: 10, minSimilarity: 0, validOnly: true,
    });
    for (const r of results.slice(0, 5)) {
      console.log(`  [${r.similarity.toFixed(4)}] ${r.fact.content.slice(0, 100)}`);
    }
  }
}
main().catch(console.error);

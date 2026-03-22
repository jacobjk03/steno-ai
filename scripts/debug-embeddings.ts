import { createSupabaseClient, SupabaseStorageAdapter } from '../packages/supabase-adapter/src/index.js';
import { OpenAIEmbeddingAdapter } from '../packages/openai-adapter/src/index.js';
import { config } from 'dotenv';
config({ path: '.env' });

async function main() {
  const supabase = createSupabaseClient({ url: process.env.SUPABASE_URL!, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY! });
  const storage = new SupabaseStorageAdapter(supabase);
  const embedding = new OpenAIEmbeddingAdapter({ apiKey: process.env.OPENAI_API_KEY! });
  const tenantId = '00000000-0000-0000-0000-a00000000002';

  const queries = [
    "What is Riley's partner's name?",
    "Where does Riley work?",
    "What course is Riley taking?",
    "What board game did Riley play?",
    "What kind of girls is Riley attracted to?",
  ];

  for (const q of queries) {
    console.log(`\n--- Query: "${q}" ---`);
    const qEmb = await embedding.embed(q);

    const results = await storage.vectorSearch({
      embedding: qEmb, tenantId, scope: 'user', scopeId: 'riley_brooks',
      limit: 10, minSimilarity: 0, validOnly: true,
    });

    for (const r of results.slice(0, 5)) {
      console.log(`  [${r.similarity.toFixed(4)}] ${r.fact.content.slice(0, 100)}`);
    }

    if (results.length === 0) console.log('  (no results)');
  }
}

main().catch(console.error);

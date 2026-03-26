import { createSupabaseClient, SupabaseStorageAdapter } from '../packages/supabase-adapter/src/index.ts';
import { search } from '../packages/engine/src/retrieval/search.ts';
import OpenAI from 'openai';

const query = process.argv[2] || 'clean.ai';

const supabase = createSupabaseClient({
  url: process.env.SUPABASE_URL!,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
});
const storage = new SupabaseStorageAdapter(supabase);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const embedding = {
  model: 'text-embedding-3-large',
  dimensions: 3072,
  async embed(text: string) {
    const res = await openai.embeddings.create({ model: 'text-embedding-3-large', input: text, dimensions: 3072 });
    return res.data[0]!.embedding;
  },
  async embedBatch(texts: string[]) {
    const res = await openai.embeddings.create({ model: 'text-embedding-3-large', input: texts, dimensions: 3072 });
    return res.data.map(d => d.embedding);
  },
};

const results = await search(
  { storage, embedding },
  { query, tenantId: '00000000-0000-0000-0000-000000000001', scope: 'user', scopeId: 'default', limit: 5 },
);

console.log(`\nQuery: "${query}"\n`);
for (const r of results.results) {
  console.log(`score=${r.score.toFixed(3)} vec=${r.signals.vectorScore.toFixed(2)} kw=${r.signals.keywordScore.toFixed(2)} graph=${r.signals.graphScore.toFixed(2)} temp=${r.signals.temporalScore.toFixed(2)}`);
  console.log(`  ${r.fact.content.slice(0, 140)}`);
  console.log();
}
console.log(`Total: ${results.durationMs}ms, candidates: ${results.totalCandidates}`);

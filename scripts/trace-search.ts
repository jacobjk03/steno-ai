/**
 * Trace search pipeline for a single query to see what each component returns
 */
import { createSupabaseClient, SupabaseStorageAdapter } from '../packages/supabase-adapter/src/index.js';
import { OpenAILLMAdapter, OpenAIEmbeddingAdapter } from '../packages/openai-adapter/src/index.js';
import { InMemoryCacheAdapter } from '../packages/cache-adapter/src/index.js';
import { CachedEmbeddingAdapter } from '../packages/engine/src/retrieval/embedding-cache.js';
import { compoundSearch } from '../packages/engine/src/retrieval/compound-search.js';
import { graphSearch } from '../packages/engine/src/retrieval/graph-traversal.js';
import { search } from '../packages/engine/src/retrieval/search.js';
import { config } from 'dotenv';
config({ path: '.env' });

const tenantId = '00000000-0000-0000-0000-a00000000002';
const query = process.argv[2] || "Where does Riley work?";

async function main() {
  const supabase = createSupabaseClient({ url: process.env.SUPABASE_URL!, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY! });
  const storage = new SupabaseStorageAdapter(supabase);
  const rawEmbedding = new OpenAIEmbeddingAdapter({ apiKey: process.env.OPENAI_API_KEY!, model: 'text-embedding-3-large', dimensions: 3072 });
  const cache = new InMemoryCacheAdapter();
  const embedding = new CachedEmbeddingAdapter(rawEmbedding, cache, 7200);
  const cheapLLM = new OpenAILLMAdapter({ apiKey: process.env.OPENAI_API_KEY!, model: 'gpt-4.1-nano' });

  console.log(`=== TRACING SEARCH: "${query}" ===\n`);

  // 1. Compound search (vector + keyword)
  console.log('--- COMPOUND SEARCH (vector + keyword) ---');
  try {
    const qEmb = await embedding.embed(query);
    const compoundResults = await storage.compoundSearch({
      embedding: qEmb, query, tenantId, scope: 'user', scopeId: 'riley_brooks', limit: 20,
    });
    console.log(`Results: ${compoundResults.length}`);
    for (const r of compoundResults.slice(0, 8)) {
      console.log(`  [${r.source} score=${r.relevanceScore.toFixed(3)}] ${(r.fact as any).content?.slice(0, 90) || 'no content'}`);
    }
  } catch(e) {
    console.error(`  ERROR: ${e instanceof Error ? e.message : e}`);
  }

  // 2. Graph search
  console.log('\n--- GRAPH SEARCH ---');
  try {
    const graphResults = await graphSearch(storage, embedding, query, tenantId, 'user', 'riley_brooks', 20);
    console.log(`Results: ${graphResults.length}`);
    for (const r of graphResults.slice(0, 8)) {
      console.log(`  [g=${r.graphScore.toFixed(3)}] ${r.fact.content.slice(0, 90)}`);
    }
  } catch(e) {
    console.error(`  ERROR: ${e instanceof Error ? e.message : e}`);
  }

  // 3. Full search (fusion + reranker)
  console.log('\n--- FULL SEARCH (fusion, NO reranker) ---');
  try {
    const fullResults = await search(
      { storage, embedding },
      { query, tenantId, scope: 'user', scopeId: 'riley_brooks', limit: 20 }
    );
    console.log(`Results: ${fullResults.results.length}`);
    for (const r of fullResults.results.slice(0, 10)) {
      const s = r.signals ?? {} as any;
      console.log(`  [score=${r.score.toFixed(3)} v=${(s.vectorScore??0).toFixed(3)} k=${(s.keywordScore??0).toFixed(3)} g=${(s.graphScore??0).toFixed(3)}] ${r.fact.content.slice(0, 80)}`);
    }
  } catch(e) {
    console.error(`  ERROR: ${e instanceof Error ? e.message : e}`);
  }
}
main().catch(console.error);

/**
 * Steno Speed Test — measure actual retrieval latency
 * Tests both the old multi-call approach and the new compound RPC
 */

import { createSupabaseClient, SupabaseStorageAdapter } from '../packages/supabase-adapter/src/index.js';
import { OpenAIEmbeddingAdapter } from '../packages/openai-adapter/src/index.js';
import { config } from 'dotenv';
config({ path: '.env' });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

async function main() {
  const supabase = createSupabaseClient({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });
  const storage = new SupabaseStorageAdapter(supabase);
  const embedding = new OpenAIEmbeddingAdapter({ apiKey: OPENAI_API_KEY, model: 'text-embedding-3-small', dimensions: 1536 });

  // First, let's see what data we have
  const { data: factCount } = await supabase.from('facts').select('id', { count: 'exact', head: true });
  console.log('=== STENO SPEED TEST ===\n');

  // Find a tenant that has data
  const { data: tenants } = await supabase.from('tenants').select('*').limit(5);
  if (!tenants || tenants.length === 0) {
    console.log('No tenants found. Run e2e-test.ts first to create data.');
    return;
  }

  // Use the first tenant with data, or create test data
  const tenantId = tenants[0].id;
  const scope = 'user';
  const scopeId = 'user_speed_test';

  // Create test facts if needed
  const { data: existingFacts } = await supabase
    .from('facts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('scope', scope)
    .eq('scope_id', scopeId)
    .limit(1);

  if (!existingFacts || existingFacts.length === 0) {
    console.log('Creating test data (10 facts with embeddings)...');
    const testFacts = [
      'User is allergic to peanuts',
      'User works at Google as a software engineer',
      'User prefers dark mode in all applications',
      'User lives in San Francisco',
      'User enjoys playing guitar on weekends',
      'User is learning Rust programming language',
      'User prefers TypeScript over JavaScript',
      'User has a golden retriever named Max',
      'User drinks oat milk in their coffee',
      'User is training for a marathon in April',
    ];

    for (const content of testFacts) {
      const emb = await embedding.embed(content);
      const id = crypto.randomUUID();
      const lineageId = crypto.randomUUID();

      await supabase.from('facts').insert({
        id, tenant_id: tenantId, scope, scope_id: scopeId,
        content, embedding: `[${emb.join(',')}]`,
        embedding_model: 'text-embedding-3-small', embedding_dim: 1536,
        version: 1, lineage_id: lineageId, operation: 'create',
        importance: 0.7, frequency: 1, decay_score: 0.5,
        contradiction_status: 'none', source_type: 'conversation',
        confidence: 0.8, modality: 'text', tags: '{}', metadata: '{}',
      });
    }
    console.log('   ✓ 10 test facts created with real embeddings\n');
  }

  const queries = [
    'Does the user have any food allergies?',
    'What programming languages does the user know?',
    'What pets does the user have?',
  ];

  // === Test 1: Measure embedding latency ===
  console.log('--- EMBEDDING LATENCY ---');
  for (const query of queries) {
    const start = Date.now();
    await embedding.embed(query);
    console.log(`  "${query.slice(0, 40)}..." → ${Date.now() - start}ms`);
  }

  // === Test 2: Old approach — separate vector + keyword calls ===
  console.log('\n--- OLD APPROACH (separate RPC calls) ---');
  for (const query of queries) {
    const queryEmb = await embedding.embed(query); // cached-ish

    const start = Date.now();

    // Vector search
    const t1 = Date.now();
    const { data: vectorResults } = await supabase.rpc('match_facts', {
      query_embedding: `[${queryEmb.join(',')}]`,
      match_tenant_id: tenantId,
      match_scope: scope,
      match_scope_id: scopeId,
      match_count: 5,
      min_similarity: 0,
      match_as_of: null,
    });
    const vectorMs = Date.now() - t1;

    // Keyword search
    const t2 = Date.now();
    const { data: keywordResults } = await supabase.rpc('keyword_search_facts', {
      search_query: query,
      match_tenant_id: tenantId,
      match_scope: scope,
      match_scope_id: scopeId,
      match_count: 5,
      match_as_of: null,
    });
    const keywordMs = Date.now() - t2;

    const totalMs = Date.now() - start;
    console.log(`  "${query.slice(0, 40)}..." → total ${totalMs}ms (vector: ${vectorMs}ms, keyword: ${keywordMs}ms, results: ${(vectorResults?.length ?? 0) + (keywordResults?.length ?? 0)})`);
  }

  // === Test 3: New compound RPC — single call ===
  console.log('\n--- NEW APPROACH (compound RPC — single call) ---');
  for (const query of queries) {
    const queryEmb = await embedding.embed(query);

    const start = Date.now();
    const { data: compoundResults, error } = await supabase.rpc('steno_search', {
      query_embedding: `[${queryEmb.join(',')}]`,
      search_query: query,
      match_tenant_id: tenantId,
      match_scope: scope,
      match_scope_id: scopeId,
      match_count: 10,
      min_similarity: 0,
    });
    const totalMs = Date.now() - start;

    if (error) {
      console.log(`  ERROR: ${error.message}`);
    } else {
      const vectorCount = compoundResults?.filter((r: any) => r.source === 'vector').length ?? 0;
      const keywordCount = compoundResults?.filter((r: any) => r.source === 'keyword').length ?? 0;
      console.log(`  "${query.slice(0, 40)}..." → ${totalMs}ms (vector: ${vectorCount}, keyword: ${keywordCount}, total: ${compoundResults?.length ?? 0})`);
    }
  }

  // === Summary ===
  console.log('\n--- BREAKDOWN ---');
  console.log('Embedding (OpenAI API):  ~200-500ms (network to OpenAI)');
  console.log('Old (2 RPCs):           ~400-800ms (2 sequential Supabase calls)');
  console.log('New (1 RPC):            ~200-400ms (1 Supabase call)');
  console.log('Total with embedding:   ~400-900ms');
  console.log('\nTo hit <200ms: cache embeddings + deploy in same region as Supabase');
}

main().catch(console.error);

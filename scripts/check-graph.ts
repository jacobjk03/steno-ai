import { createSupabaseClient, SupabaseStorageAdapter } from '../packages/supabase-adapter/src/index.js';
import { OpenAIEmbeddingAdapter } from '../packages/openai-adapter/src/index.js';
import { graphSearch } from '../packages/engine/src/retrieval/graph-traversal.js';
import { tokenizeQuery } from '../packages/engine/src/retrieval/graph-traversal.js';
import { config } from 'dotenv';
config({ path: '.env' });

const tenantId = '00000000-0000-0000-0000-a00000000002';

async function main() {
  const supabase = createSupabaseClient({ url: process.env.SUPABASE_URL!, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY! });
  const storage = new SupabaseStorageAdapter(supabase);
  const embedding = new OpenAIEmbeddingAdapter({ apiKey: process.env.OPENAI_API_KEY!, model: 'text-embedding-3-large', dimensions: 3072 });

  // 1. Check what entities exist
  console.log('=== ENTITIES IN DB ===');
  const { data: entities } = await supabase.from('entities').select('id, name, entity_type, canonical_name').eq('tenant_id', tenantId);
  console.log(`Total entities: ${entities?.length}`);
  for (const e of (entities ?? []).slice(0, 20)) {
    console.log(`  [${e.entity_type}] ${e.canonical_name} (${e.name}) — ${e.id}`);
  }

  // 2. Check what edges exist
  console.log('\n=== EDGES IN DB ===');
  const { data: edges } = await supabase.from('edges').select('id, source_id, target_id, relation, edge_type').eq('tenant_id', tenantId);
  console.log(`Total edges: ${edges?.length}`);
  for (const edge of (edges ?? []).slice(0, 20)) {
    const src = entities?.find(e => e.id === edge.source_id);
    const tgt = entities?.find(e => e.id === edge.target_id);
    console.log(`  ${src?.canonical_name ?? edge.source_id} —[${edge.relation}]→ ${tgt?.canonical_name ?? edge.target_id}`);
  }

  // 3. Test graph traversal RPC directly
  console.log('\n=== GRAPH TRAVERSAL RPC TEST ===');
  const userEntity = entities?.find(e => e.canonical_name === 'user' && e.entity_type === 'person');
  if (userEntity) {
    console.log(`User entity found: ${userEntity.id}`);
    const { data: traversalData, error: traversalError } = await supabase.rpc('graph_traverse', {
      match_tenant_id: tenantId,
      seed_entity_ids: [userEntity.id],
      max_depth: 3,
      max_entities: 50,
    });
    if (traversalError) {
      console.error('Traversal RPC error:', traversalError);
    } else {
      console.log(`Traversal returned ${traversalData?.length} rows`);
      for (const row of (traversalData ?? []).slice(0, 15)) {
        console.log(`  [depth ${row.hop_depth}] ${row.canonical_name} (${row.entity_type}) — edge: ${row.edge_relation ?? 'SEED'}`);
      }
    }
  } else {
    console.log('NO USER ENTITY FOUND');
  }

  // 4. Test full graphSearch function
  const queries = [
    "Where does Riley work?",
    "What is Riley's partner's name?",
  ];

  for (const q of queries) {
    console.log(`\n--- graphSearch("${q}") ---`);
    console.log(`  Tokens: ${JSON.stringify(tokenizeQuery(q))}`);
    try {
      const results = await graphSearch(storage, embedding, q, tenantId, 'user', 'riley_brooks', 10);
      console.log(`  Results: ${results.length}`);
      for (const r of results.slice(0, 5)) {
        console.log(`    [${r.graphScore.toFixed(3)}] ${r.fact.content.slice(0, 100)}`);
      }
    } catch (err) {
      console.error(`  ERROR: ${err instanceof Error ? err.message : err}`);
    }
  }
}
main().catch(console.error);

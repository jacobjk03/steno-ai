/**
 * Steno End-to-End Integration Test
 *
 * Runs the FULL pipeline against real Supabase + real OpenAI:
 * 1. Create tenant + API key
 * 2. Extract memories from a conversation (real LLM call)
 * 3. Search for memories (real pgvector similarity search)
 * 4. Verify the whole thing works
 */

import { createSupabaseClient, SupabaseStorageAdapter } from '../packages/supabase-adapter/src/index.js';
import { OpenAILLMAdapter, OpenAIEmbeddingAdapter } from '../packages/openai-adapter/src/index.js';
import { InMemoryCacheAdapter } from '../packages/cache-adapter/src/index.js';
import { generateApiKey, hashApiKey } from '../packages/engine/src/auth/api-key.js';
import { runExtractionPipeline } from '../packages/engine/src/extraction/pipeline.js';
import { search } from '../packages/engine/src/retrieval/search.js';
import type { PipelineConfig } from '../packages/engine/src/extraction/pipeline.js';
import type { SearchConfig } from '../packages/engine/src/retrieval/search.js';

// Load env
import { config } from 'dotenv';
config({ path: '.env' });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

async function main() {
  console.log('=== STENO END-TO-END INTEGRATION TEST ===\n');

  // 1. Create adapters
  console.log('1. Creating adapters...');
  const supabase = createSupabaseClient({
    url: SUPABASE_URL,
    serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
  });
  const storage = new SupabaseStorageAdapter(supabase);
  const embedding = new OpenAIEmbeddingAdapter({
    apiKey: OPENAI_API_KEY,
    model: 'text-embedding-3-small',
    dimensions: 1536,
  });
  const cheapLLM = new OpenAILLMAdapter({
    apiKey: OPENAI_API_KEY,
    model: 'gpt-4.1-nano',
  });
  console.log('   ✓ Supabase, OpenAI LLM, OpenAI Embedding adapters ready\n');

  // 2. Check Supabase connection
  console.log('2. Testing Supabase connection...');
  const pingOk = await storage.ping();
  console.log(`   ${pingOk ? '✓' : '✗'} Supabase ping: ${pingOk}\n`);
  if (!pingOk) {
    console.error('   FAILED: Cannot connect to Supabase. Check your credentials.');
    process.exit(1);
  }

  // 3. Create tenant
  console.log('3. Creating test tenant...');
  const tenantId = crypto.randomUUID();
  const tenant = await storage.createTenant({
    id: tenantId,
    name: 'E2E Test Tenant',
    slug: `e2e-test-${Date.now()}`,
    plan: 'pro',
  });
  console.log(`   ✓ Tenant created: ${tenant.name} (${tenant.id})\n`);

  // 4. Create API key
  console.log('4. Creating API key...');
  const { key, prefix } = generateApiKey();
  const keyHash = await hashApiKey(key);
  const apiKey = await storage.createApiKey({
    id: crypto.randomUUID(),
    tenantId,
    keyHash,
    keyPrefix: prefix,
    name: 'E2E Test Key',
    scopes: ['read', 'write', 'admin'],
  });
  console.log(`   ✓ API key created: ${prefix}... (${apiKey.name})\n`);

  // 5. Run extraction pipeline with a REAL conversation
  console.log('5. Running extraction pipeline (REAL OpenAI call)...');
  console.log('   Sending conversation to GPT-4.1-nano for fact extraction...');

  const pipelineConfig: PipelineConfig = {
    storage,
    embedding,
    cheapLLM,
    embeddingModel: 'text-embedding-3-small',
    embeddingDim: 1536,
    extractionTier: 'auto',
  };

  const startExtract = Date.now();
  const extractionResult = await runExtractionPipeline(pipelineConfig, {
    tenantId,
    scope: 'user',
    scopeId: 'user_e2e_test',
    inputType: 'conversation',
    data: {
      messages: [
        { role: 'user', content: "Hi! I'm Alex, I work at Google as a software engineer. I'm allergic to peanuts and I love playing guitar." },
        { role: 'assistant', content: "Nice to meet you Alex! I'll remember that you work at Google, are a software engineer, have a peanut allergy, and enjoy playing guitar." },
        { role: 'user', content: "Also, I prefer dark mode in all my apps, and I'm based in San Francisco." },
        { role: 'assistant', content: "Got it! Dark mode preference and SF location noted." },
      ],
    },
  });
  const extractDuration = Date.now() - startExtract;

  console.log(`   ✓ Extraction complete in ${extractDuration}ms`);
  console.log(`     Facts created: ${extractionResult.factsCreated}`);
  console.log(`     Facts updated: ${extractionResult.factsUpdated}`);
  console.log(`     Entities created: ${extractionResult.entitiesCreated}`);
  console.log(`     Edges created: ${extractionResult.edgesCreated}`);
  console.log(`     Tier used: ${extractionResult.tier}`);
  console.log(`     Tokens: ${extractionResult.costTokensInput} in / ${extractionResult.costTokensOutput} out`);
  console.log(`     Duration: ${extractionResult.durationMs}ms\n`);

  // 6. Search for memories (REAL pgvector similarity search)
  console.log('6. Searching for memories (REAL pgvector + embedding)...');

  const searchConfig: SearchConfig = {
    storage,
    embedding,
  };

  // Search 1: Health-related
  console.log('\n   Query: "Does this user have any allergies?"');
  const startSearch1 = Date.now();
  const healthResults = await search(searchConfig, {
    query: 'Does this user have any allergies?',
    tenantId,
    scope: 'user',
    scopeId: 'user_e2e_test',
    limit: 5,
  });
  const search1Duration = Date.now() - startSearch1;

  console.log(`   ✓ Search complete in ${search1Duration}ms (${healthResults.totalCandidates} candidates)`);
  for (const result of healthResults.results) {
    console.log(`     [${result.score.toFixed(3)}] ${result.fact.content}`);
    console.log(`       vector=${result.signals.vectorScore.toFixed(3)} keyword=${result.signals.keywordScore.toFixed(3)} graph=${result.signals.graphScore.toFixed(3)}`);
  }

  // Search 2: Work-related
  console.log('\n   Query: "Where does the user work?"');
  const startSearch2 = Date.now();
  const workResults = await search(searchConfig, {
    query: 'Where does the user work?',
    tenantId,
    scope: 'user',
    scopeId: 'user_e2e_test',
    limit: 5,
  });
  const search2Duration = Date.now() - startSearch2;

  console.log(`   ✓ Search complete in ${search2Duration}ms (${workResults.totalCandidates} candidates)`);
  for (const result of workResults.results) {
    console.log(`     [${result.score.toFixed(3)}] ${result.fact.content}`);
  }

  // Search 3: Preferences
  console.log('\n   Query: "What are the user\'s preferences?"');
  const startSearch3 = Date.now();
  const prefResults = await search(searchConfig, {
    query: "What are the user's preferences?",
    tenantId,
    scope: 'user',
    scopeId: 'user_e2e_test',
    limit: 5,
  });
  const search3Duration = Date.now() - startSearch3;

  console.log(`   ✓ Search complete in ${search3Duration}ms (${prefResults.totalCandidates} candidates)`);
  for (const result of prefResults.results) {
    console.log(`     [${result.score.toFixed(3)}] ${result.fact.content}`);
  }

  // 7. Summary
  console.log('\n=== RESULTS ===\n');
  console.log(`Extraction: ${extractionResult.factsCreated} facts extracted in ${extractDuration}ms`);
  console.log(`Search 1 (allergies): ${healthResults.results.length} results in ${search1Duration}ms`);
  console.log(`Search 2 (work): ${workResults.results.length} results in ${search2Duration}ms`);
  console.log(`Search 3 (preferences): ${prefResults.results.length} results in ${search3Duration}ms`);

  const allPassed = extractionResult.factsCreated > 0 &&
    healthResults.results.length > 0 &&
    workResults.results.length > 0;

  console.log(`\n${allPassed ? '✅ ALL TESTS PASSED — STENO WORKS END-TO-END!' : '❌ SOME TESTS FAILED'}`);

  // Wait for fire-and-forget background tasks (recordAccesses, decay updates) to finish
  console.log('\nWaiting for background tasks to complete...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Cleanup: delete test tenant's data
  console.log('Cleaning up test data...');
  await storage.purgeFacts(tenantId, 'user', 'user_e2e_test');
  console.log('Done.');
}

main().catch((err) => {
  console.error('\n❌ E2E TEST FAILED:', err);
  process.exit(1);
});

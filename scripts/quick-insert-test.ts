import { createSupabaseClient, SupabaseStorageAdapter } from '../packages/supabase-adapter/src/index.js';
import { OpenAILLMAdapter, OpenAIEmbeddingAdapter } from '../packages/openai-adapter/src/index.js';
import { runExtractionPipeline } from '../packages/engine/src/extraction/pipeline.js';
import { config } from 'dotenv';
config({ path: '.env' });

async function main() {
  const supabase = createSupabaseClient({ url: process.env.SUPABASE_URL!, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY! });
  const storage = new SupabaseStorageAdapter(supabase);
  const embedding = new OpenAIEmbeddingAdapter({ apiKey: process.env.OPENAI_API_KEY! });
  const cheapLLM = new OpenAILLMAdapter({ apiKey: process.env.OPENAI_API_KEY!, model: 'gpt-4.1-nano' });

  const tenantId = '00000000-0000-0000-0000-a00000000002';

  console.log('Extracting...');
  const result = await runExtractionPipeline(
    { storage, embedding, cheapLLM, embeddingModel: 'text-embedding-3-small', embeddingDim: 1536 },
    { tenantId, scope: 'user', scopeId: 'quick_test', inputType: 'raw_text', data: 'My name is Riley and I love Casey. I work at Brightwell Capital.' }
  );
  console.log('Extraction:', JSON.stringify(result));

  console.log('\nChecking DB...');
  const facts = await storage.getFactsByScope(tenantId, 'user', 'quick_test', { limit: 20 });
  console.log(`Facts in DB: ${facts.data.length}`);
  for (const f of facts.data) console.log(`  - ${f.content}`);

  // Cleanup
  await storage.purgeFacts(tenantId, 'user', 'quick_test');
}

main().catch(console.error);

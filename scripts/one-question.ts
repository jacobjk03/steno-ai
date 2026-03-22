import { createSupabaseClient, SupabaseStorageAdapter } from '../packages/supabase-adapter/src/index.js';
import { OpenAILLMAdapter, OpenAIEmbeddingAdapter } from '../packages/openai-adapter/src/index.js';
import { search } from '../packages/engine/src/retrieval/search.js';
import { config } from 'dotenv';
config({ path: '.env' });

async function main() {
  const supabase = createSupabaseClient({ url: process.env.SUPABASE_URL!, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY! });
  const storage = new SupabaseStorageAdapter(supabase);
  const embedding = new OpenAIEmbeddingAdapter({ apiKey: process.env.OPENAI_API_KEY! });
  const cheapLLM = new OpenAILLMAdapter({ apiKey: process.env.OPENAI_API_KEY!, model: 'gpt-4.1-nano' });

  const results = await search(
    { storage, embedding, rerankerLLM: cheapLLM },
    { query: "What board game did Riley play?", tenantId: '00000000-0000-0000-0000-a00000000002', scope: 'user', scopeId: 'riley_brooks', limit: 20 }
  );

  const context = results.results.map(r => r.fact.content).join('\n');

  const answer = await cheapLLM.complete([
    { role: 'system', content: 'Answer the question based on the context. IMPORTANT: "User" in the context refers to the person being asked about. So "User played Catan" = "Riley played Catan". Be concise.' },
    { role: 'user', content: `Context:\n${context}\n\nQuestion: What board game did Riley play?` },
  ], { temperature: 0 });

  console.log('Answer:', answer.content);
}
main().catch(console.error);

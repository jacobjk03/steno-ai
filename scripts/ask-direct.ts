import { createSupabaseClient, SupabaseStorageAdapter } from '../packages/supabase-adapter/src/index.js';
import { OpenAILLMAdapter } from '../packages/openai-adapter/src/index.js';
import { GeminiEmbeddingAdapter } from '../packages/engine/src/adapters/gemini-embedding.js';
import { search } from '../packages/engine/src/retrieval/search.js';
import { config } from 'dotenv';
config({ path: '.env' });

async function main() {
  const supabase = createSupabaseClient({ url: process.env.SUPABASE_URL!, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY! });
  const storage = new SupabaseStorageAdapter(supabase);
  const embedding = new GeminiEmbeddingAdapter({ apiKey: process.env.GEMINI_API_KEY! });
  const cheapLLM = new OpenAILLMAdapter({ apiKey: process.env.OPENAI_API_KEY!, model: 'gpt-4.1-nano' });
  const tenantId = '00000000-0000-0000-0000-a00000000002';

  const questions = [
    { q: "Where does Riley work? What company?", a: "Brightwell" },
    { q: "What did Casey say Riley should have bought instead of diamond earrings?", a: "AirPods Max" },
    { q: "What type of girls is Riley attracted to that makes him question his relationship with Casey?", a: "Asian" },
  ];

  for (const { q, a } of questions) {
    // Search with broader retrieval — top 50
    const results = await search(
      { storage, embedding },
      { query: q, tenantId, scope: 'user', scopeId: 'riley_brooks', limit: 50 }
    );

    const context = results.results.map(r => r.fact.content).join('\n');

    const answer = await cheapLLM.complete([
      { role: 'system', content: 'You are answering questions about a person. The memories below refer to this person as "User". When the question asks about "Riley", "User" IS Riley. They are the SAME person.\n\nExample: If context says "User loves Casey" and question asks "Who does Riley love?" → answer is "Casey".' },
      { role: 'user', content: `Memories:\n${context}\n\nQuestion: ${q}` },
    ], { temperature: 0 });

    const correct = answer.content.toLowerCase().includes(a.toLowerCase()) ||
                    (a === "Yes" && answer.content.toLowerCase().includes("yes"));
    console.log(`${correct ? '✓' : '✗'} ${q}`);
    console.log(`  → ${answer.content.slice(0, 120)}`);
    console.log(`  Expected: ${a}\n`);
  }
}
main().catch(console.error);

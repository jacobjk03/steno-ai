import { config } from 'dotenv';
config({ path: '.env' });

import { createSupabaseClient, SupabaseStorageAdapter } from '../packages/supabase-adapter/src/index.js';
import { PerplexityEmbeddingAdapter } from '../packages/engine/src/adapters/perplexity-embedding.js';
import { OpenAILLMAdapter } from '../packages/openai-adapter/src/index.js';
import { runExtractionPipeline } from '../packages/engine/src/extraction/pipeline.js';
import { search } from '../packages/engine/src/retrieval/search.js';

const supabase = createSupabaseClient({ url: process.env.SUPABASE_URL!, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY! });
const storage = new SupabaseStorageAdapter(supabase);
const embedding = new PerplexityEmbeddingAdapter({ apiKey: process.env.PERPLEXITY_API_KEY!, model: 'pplx-embed-v1-4b', dimensions: 2000 });
const cheapLLM = new OpenAILLMAdapter({ apiKey: process.env.OPENAI_API_KEY!, model: 'gpt-4.1-mini' });
const T = '00000000-0000-0000-0000-000000000099';

async function main() {
  try { await storage.createTenant({ id: T, name: 'Test', slug: `test-${Date.now()}`, plan: 'enterprise' as const }); } catch {}
  await storage.purgeFacts(T, 'user', 'debug');

  console.log('Ingesting test conversation...');
  await runExtractionPipeline(
    { storage, embedding, cheapLLM, embeddingModel: 'pplx-embed-v1-4b', embeddingDim: 2000, extractionTier: 'auto' },
    { tenantId: T, scope: 'user', scopeId: 'debug', inputType: 'raw_text',
      data: `[This conversation took place on 15 March 2026]
user: My name is Alex and I just moved to Tokyo from Berlin. I got a new job at Sony as a senior engineer.
assistant: That's exciting! How do you like Tokyo so far?
user: I love it. The food is amazing, especially the ramen near Shibuya station. My partner Yuki showed me around.
assistant: Yuki sounds great. What are you working on at Sony?
user: I'm building a real-time audio processing engine in Rust. Similar to what I did at my previous company in Berlin where I worked on WebRTC.
assistant: Rust for audio, nice choice.
user: Yeah I decided to use Rust over C++ because of memory safety. Also I prefer vim keybindings and dark mode in my editor. Oh and I hate writing CSS, always have.` },
  );

  // Dump all facts
  const { data } = await supabase.from('facts').select('content,importance').eq('tenant_id', T).eq('scope_id', 'debug').is('valid_until', null).order('importance', { ascending: false });
  console.log(`\nExtracted ${data?.length} facts:\n`);
  for (const f of data || []) {
    const flags = [];
    if (f.content.toLowerCase().includes('berlin')) flags.push('BERLIN');
    if (f.content.toLowerCase().includes('css')) flags.push('CSS');
    if (f.content.toLowerCase().includes('webrtc')) flags.push('WEBRTC');
    const tag = flags.length ? ` ← ${flags.join(', ')}` : '';
    console.log(`  [${parseFloat(f.importance).toFixed(2)}] ${f.content.slice(0, 120)}${tag}`);
  }

  // Test failing queries
  console.log('\n=== Failing Query Debug ===\n');
  for (const q of ['Where did Alex work before Sony?', 'Does Alex like CSS?']) {
    const res = await search({ storage, embedding }, { query: q, tenantId: T, scope: 'user', scopeId: 'debug', limit: 5 });
    console.log(`Q: "${q}"`);
    for (const r of res.results) {
      const s = r.signals;
      console.log(`  [${r.score.toFixed(2)}] v=${s.vectorScore.toFixed(2)} k=${s.keywordScore.toFixed(2)} g=${s.graphScore.toFixed(2)} | ${r.fact.content.slice(0, 80)}`);
    }
    console.log('');
  }

  await storage.purgeFacts(T, 'user', 'debug');
}

main().catch(err => { console.error(err); process.exit(1); });

import { createSupabaseClient, SupabaseStorageAdapter } from '../packages/supabase-adapter/src/index.ts';
import { OpenAILLMAdapter } from '../packages/openai-adapter/src/index.ts';
import { linkRelatedFacts } from '../packages/engine/src/extraction/cross-linker.ts';
import { writeFileSync, appendFileSync } from 'fs';

const LOG = '/tmp/crosslink-log.txt';
const log = (msg: string) => {
  process.stderr.write(msg + '\n');
  appendFileSync(LOG, msg + '\n');
};

writeFileSync(LOG, `Crosslink backfill started at ${new Date().toISOString()}\n`);

const supabase = createSupabaseClient({ url: process.env.SUPABASE_URL!, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY! });
const storage = new SupabaseStorageAdapter(supabase);
const llm = new OpenAILLMAdapter({ apiKey: process.env.OPENAI_API_KEY!, model: 'gpt-5.4-mini' });

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

const allFacts = await storage.getFactsByScope(TENANT_ID, 'user', 'default', { limit: 500 });
const facts = allFacts.data.filter(f => !f.tags?.includes('scratchpad'));
log(`Found ${facts.length} facts`);

const ents = await storage.getEntitiesForTenant(TENANT_ID, { limit: 500 });
const entityIdMap = new Map<string, string>();
for (const e of ents.data) entityIdMap.set(e.canonicalName, e.id);
log(`Found ${entityIdMap.size} entities`);

let total = 0;
for (let i = 0; i < facts.length; i += 5) {
  const batch = facts.slice(i, i + 5);
  try {
    const edges = await linkRelatedFacts(storage, TENANT_ID, batch.map(f => f.id), entityIdMap, llm);
    total += edges;
    if (edges > 0) log(`Batch ${Math.floor(i/5)+1}: ${edges} edges`);
    else if (i % 25 === 0) log(`Batch ${Math.floor(i/5)+1}: processing... (${total} total so far)`);
  } catch (err: any) {
    log(`Batch ${Math.floor(i/5)+1} ERROR: ${err.message?.slice(0, 100)}`);
  }
  if (i + 5 < facts.length) await new Promise(r => setTimeout(r, 1500));
}
log(`\nDone: ${total} cross-fact edges created`);
process.exit(0);

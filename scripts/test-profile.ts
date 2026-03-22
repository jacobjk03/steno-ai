import { createSupabaseClient, SupabaseStorageAdapter } from '../packages/supabase-adapter/src/index.js';
import { getUserProfile } from '../packages/engine/src/profiles/profile.js';
import { config } from 'dotenv';
config({ path: '.env' });

async function main() {
  const supabase = createSupabaseClient({ url: process.env.SUPABASE_URL!, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY! });
  const storage = new SupabaseStorageAdapter(supabase);

  const profile = await getUserProfile(storage, '00000000-0000-0000-0000-a00000000002', 'riley_brooks');

  console.log('=== RILEY BROOKS PROFILE ===\n');
  console.log(`Static facts (${profile.static.length}):`);
  for (const f of profile.static.slice(0, 10)) {
    console.log(`  [${f.importance.toFixed(2)} ${f.category}] ${f.content}`);
  }

  console.log(`\nDynamic facts (${profile.dynamic.length}):`);
  for (const f of profile.dynamic.slice(0, 10)) {
    console.log(`  [${f.importance.toFixed(2)} ${f.category}] ${f.content}`);
  }

  console.log(`\nLast updated: ${profile.lastUpdated}`);
}
main().catch(console.error);

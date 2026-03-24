import { createSupabaseClient, SupabaseStorageAdapter } from '../packages/supabase-adapter/src/index.js';
import { config } from 'dotenv';
config({ path: '.env' });

async function main() {
  const supabase = createSupabaseClient({ url: process.env.SUPABASE_URL!, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY! });
  const storage = new SupabaseStorageAdapter(supabase);

  // Test getFactsForEntity for User entity
  console.log('Testing getFactsForEntity for User...');
  const result = await storage.getFactsForEntity('00000000-0000-0000-0000-a00000000002', '986259d5-457d-4a53-8f75-7329381a8e55', { limit: 5 });
  console.log(`User entity facts: ${result.data.length}`);
  for (const f of result.data) {
    console.log(`  ${f.content.slice(0, 80)}`);
  }

  // Test for Brightwell Capital
  console.log('\nTesting getFactsForEntity for Brightwell Capital...');
  const bw = await storage.getFactsForEntity('00000000-0000-0000-0000-a00000000002', 'be38f244-9bcd-4f36-b939-5aded59e86f6', { limit: 5 });
  console.log(`Brightwell facts: ${bw.data.length}`);
  for (const f of bw.data) {
    console.log(`  ${f.content.slice(0, 80)}`);
  }

  // Now test 5 concurrent calls
  console.log('\nTesting 5 concurrent getFactsForEntity calls...');
  const entities = [
    '986259d5-457d-4a53-8f75-7329381a8e55', // user
    'be38f244-9bcd-4f36-b939-5aded59e86f6', // brightwell
    '3fca43ac-ef97-461a-8879-b27e7984d811', // casey
    '4cadfed5-dbbe-4ea3-9c42-c4495ed186f2', // evan
    'a3e2d3c3-3c71-466d-b3a7-0b04b2750424', // taylor
  ];
  const results = await Promise.allSettled(
    entities.map(id => storage.getFactsForEntity('00000000-0000-0000-0000-a00000000002', id, { limit: 3 }))
  );
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      console.log(`  ${entities[i].slice(0,8)}: ${r.value.data.length} facts`);
    } else {
      console.log(`  ${entities[i].slice(0,8)}: FAILED - ${r.reason}`);
    }
  }
}
main().catch(console.error);

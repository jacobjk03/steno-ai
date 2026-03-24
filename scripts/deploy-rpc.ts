import { createSupabaseClient } from '../packages/supabase-adapter/src/index.js';
import { config } from 'dotenv';
import * as fs from 'node:fs';
config({ path: '.env' });

async function main() {
  const supabase = createSupabaseClient({ url: process.env.SUPABASE_URL!, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY! });
  const sql = fs.readFileSync('./packages/supabase-adapter/src/migrations/018_graph_traverse_rpc.sql', 'utf-8');

  // Use the Supabase management API or direct pg connection
  // Since we can't run raw DDL via PostgREST, let's use the SQL editor endpoint
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // Try using the pg_net extension or direct fetch to execute DDL
  const resp = await fetch(`${url}/rest/v1/rpc/graph_traverse`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      match_tenant_id: '00000000-0000-0000-0000-000000000000',
      seed_entity_ids: [],
      max_depth: 1,
      max_entities: 1,
    }),
  });

  console.log('Current RPC status:', resp.status);
  const body = await resp.text();
  console.log('Response:', body.slice(0, 200));
  console.log('\nThe RPC needs to be updated via Supabase SQL Editor.');
  console.log('SQL to run:');
  console.log(sql);
}
main().catch(console.error);

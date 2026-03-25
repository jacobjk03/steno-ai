#!/usr/bin/env node
/**
 * Steno SessionStart hook — injects user memories into every Claude Code session.
 * Uses raw fetch (no npm deps needed).
 */
import { readFileSync } from 'fs';

// Load env from .env file
try {
  const envFile = readFileSync('/Volumes/ExtSSD/WebProjects/steno/.env', 'utf-8');
  for (const line of envFile.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.+)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim();
    }
  }
} catch {}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TENANT_ID = process.env.STENO_TENANT_ID || '00000000-0000-0000-0000-000000000001';
const SCOPE_ID = process.env.STENO_SCOPE_ID || 'default';

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log(JSON.stringify({}));
    return;
  }

  try {
    // Use Supabase REST API directly — no npm packages needed
    const url = `${SUPABASE_URL}/rest/v1/facts?tenant_id=eq.${TENANT_ID}&scope=eq.user&scope_id=eq.${SCOPE_ID}&valid_until=is.null&select=content,importance&order=importance.desc,created_at.desc&limit=20`;

    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    });

    if (!res.ok) {
      console.log(JSON.stringify({}));
      return;
    }

    const facts = await res.json();
    if (!facts || facts.length === 0) {
      console.log(JSON.stringify({}));
      return;
    }

    const memoryList = facts.map(f => `- ${f.content}`).join('\n');

    console.log(JSON.stringify({
      additionalContext: `# Steno Memory — What I know about you\n\n${memoryList}\n\nUse steno_remember to save new info. Use steno_recall to search memories.`
    }));
  } catch {
    console.log(JSON.stringify({}));
  }
}

main();

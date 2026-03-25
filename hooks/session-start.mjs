#!/usr/bin/env node
/**
 * Steno SessionStart hook — injects user profile via the FULL steno engine.
 * Uses the real search pipeline: vector + keyword + graph + recency + salience.
 * No dumb SQL queries — this goes through the same infrastructure as everything else.
 */
import { readFileSync } from 'fs';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

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
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const PPLX_KEY = process.env.PERPLEXITY_API_KEY;
const TENANT_ID = process.env.STENO_TENANT_ID || '00000000-0000-0000-0000-000000000001';
const SCOPE_ID = process.env.STENO_SCOPE_ID || 'default';

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) {
    console.log(JSON.stringify({}));
    return;
  }

  try {
    // Import steno engine directly
    const { createSupabaseClient, SupabaseStorageAdapter } = await import(
      '/Volumes/ExtSSD/WebProjects/steno/packages/supabase-adapter/src/index.js'
    );
    const { search } = await import(
      '/Volumes/ExtSSD/WebProjects/steno/packages/engine/src/retrieval/search.js'
    );

    const supabase = createSupabaseClient({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_KEY });
    const storage = new SupabaseStorageAdapter(supabase);

    // Set up embedding adapter
    let embedding;
    if (PPLX_KEY) {
      const { PerplexityEmbeddingAdapter } = await import(
        '/Volumes/ExtSSD/WebProjects/steno/packages/engine/src/adapters/perplexity-embedding.js'
      );
      embedding = new PerplexityEmbeddingAdapter({
        apiKey: PPLX_KEY, model: 'pplx-embed-v1-4b', dimensions: 2000,
      });
    } else {
      const { OpenAIEmbeddingAdapter } = await import(
        '/Volumes/ExtSSD/WebProjects/steno/packages/openai-adapter/src/index.js'
      );
      embedding = new OpenAIEmbeddingAdapter({
        apiKey: OPENAI_KEY, model: 'text-embedding-3-large', dimensions: 3072,
      });
    }

    // Run TWO searches through the full engine:
    // 1. Profile query — who is this user, identity, core facts
    // 2. Recent activity — what have they been working on lately
    const [profileResults, recentResults] = await Promise.all([
      search(
        { storage, embedding },
        {
          query: 'user identity name role preferences background who is this person',
          tenantId: TENANT_ID, scope: 'user', scopeId: SCOPE_ID, limit: 10,
        },
      ),
      search(
        { storage, embedding },
        {
          query: 'recent activity current project working on latest decisions',
          tenantId: TENANT_ID, scope: 'user', scopeId: SCOPE_ID, limit: 10,
        },
      ),
    ]);

    // Deduplicate facts across both searches
    const seen = new Set();
    const allFacts = [];
    for (const r of [...profileResults.results, ...recentResults.results]) {
      if (!seen.has(r.fact.id)) {
        seen.add(r.fact.id);
        allFacts.push(r);
      }
    }

    if (allFacts.length === 0) {
      console.log(JSON.stringify({}));
      return;
    }

    // Sort by score descending
    allFacts.sort((a, b) => b.score - a.score);

    const memoryList = allFacts
      .slice(0, 15)
      .map(r => `- ${r.fact.content}`)
      .join('\n');

    console.log(JSON.stringify({
      additionalContext: `# Steno Memory — User Profile & Context

The following is retrieved from the steno memory system using semantic search, knowledge graph traversal, keyword matching, recency scoring, and salience weighting:

${memoryList}

Instructions:
- Use these memories to personalize responses naturally.
- To save new information, use the steno_remember tool.
- To search for specific memories, use steno_recall.
- Don't mention "steno" or "memory system" to the user unless they ask about it.`
    }));
  } catch (err) {
    // Don't break the session if memory fetch fails
    console.log(JSON.stringify({}));
  }
}

main();

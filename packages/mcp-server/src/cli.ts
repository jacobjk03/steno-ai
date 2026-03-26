#!/usr/bin/env node
/**
 * Standalone Steno MCP server — installable via npx @steno-ai/mcp
 * Everything is bundled — no npm dependencies needed at runtime.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createLocalServer } from './local-server.js';
import { createSupabaseClient, SupabaseStorageAdapter } from '../../supabase-adapter/src/index.js';
import { OpenAILLMAdapter, OpenAIEmbeddingAdapter } from '../../openai-adapter/src/index.js';
import { PerplexityEmbeddingAdapter } from '../../engine/src/adapters/perplexity-embedding.js';

async function main(): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.\n');
    process.exit(1);
  }
  if (!openaiKey) {
    console.error('Error: OPENAI_API_KEY is required.\n');
    process.exit(1);
  }

  const supabase = createSupabaseClient({ url: supabaseUrl, serviceRoleKey: supabaseKey });
  const storage = new SupabaseStorageAdapter(supabase);
  const cheapLLM = new OpenAILLMAdapter({ apiKey: openaiKey, model: 'gpt-5.4-mini' });

  let embedding: any;
  let embeddingModel: string;
  let embeddingDim: number;

  if (process.env.PERPLEXITY_API_KEY) {
    embedding = new PerplexityEmbeddingAdapter({
      apiKey: process.env.PERPLEXITY_API_KEY,
      model: 'pplx-embed-v1-4b',
      dimensions: 2000,
    });
    embeddingModel = 'pplx-embed-v1-4b';
    embeddingDim = 2000;
  } else {
    embedding = new OpenAIEmbeddingAdapter({ apiKey: openaiKey, model: 'text-embedding-3-large', dimensions: 3072 });
    embeddingModel = 'text-embedding-3-large';
    embeddingDim = 3072;
  }

  const tenantId = process.env.STENO_TENANT_ID || '00000000-0000-0000-0000-000000000001';
  const scopeId = process.env.STENO_SCOPE_ID || 'default';

  try {
    await storage.createTenant({ id: tenantId, name: 'MCP User', slug: `mcp-${Date.now()}`, plan: 'enterprise' });
  } catch { /* already exists */ }

  const server = createLocalServer({
    storage, embedding, cheapLLM, tenantId,
    scope: 'user', scopeId, embeddingModel, embeddingDim,
  });

  process.stdout.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') return;
    console.error('[steno] stdout error:', err);
  });
  process.stdin.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') return;
    console.error('[steno] stdin error:', err);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[steno] MCP server started');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

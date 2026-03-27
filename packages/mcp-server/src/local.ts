#!/usr/bin/env node
/**
 * Local Steno MCP server for Claude Code.
 *
 * Connects directly to Supabase — no API deployment needed.
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   OPENAI_API_KEY
 *   PERPLEXITY_API_KEY (optional — falls back to OpenAI embeddings)
 *
 * Optional:
 *   STENO_TENANT_ID (default: auto-created)
 *   STENO_SCOPE_ID  (default: "default")
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createLocalServer } from './local-server.js';

async function main(): Promise<void> {
  // Validate required env vars
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

  // Dynamic imports to avoid loading everything at module level
  const { createSupabaseClient, SupabaseStorageAdapter } = await import(
    '@steno-ai/supabase-adapter'
  );
  const { OpenAILLMAdapter } = await import('@steno-ai/openai-adapter');

  // Set up adapters
  const supabase = createSupabaseClient({ url: supabaseUrl, serviceRoleKey: supabaseKey });
  const storage = new SupabaseStorageAdapter(supabase);
  const cheapLLM = new OpenAILLMAdapter({ apiKey: openaiKey, model: 'gpt-5.4-mini' });

  // Embedding: prefer Perplexity (cheaper, 2000 dims) else OpenAI (3072 dims)
  let embedding: any;
  let embeddingModel: string;
  let embeddingDim: number;

  if (process.env.PERPLEXITY_API_KEY) {
    const { PerplexityEmbeddingAdapter } = await import(
      '@steno-ai/engine'
    );
    embedding = new PerplexityEmbeddingAdapter({
      apiKey: process.env.PERPLEXITY_API_KEY,
      model: 'pplx-embed-v1-4b',
      dimensions: 2000,
    });
    embeddingModel = 'pplx-embed-v1-4b';
    embeddingDim = 2000;
  } else {
    const { OpenAIEmbeddingAdapter } = await import('@steno-ai/openai-adapter');
    embedding = new OpenAIEmbeddingAdapter({
      apiKey: openaiKey,
      model: 'text-embedding-3-large',
      dimensions: 3072,
    });
    embeddingModel = 'text-embedding-3-large';
    embeddingDim = 3072;
  }

  // Tenant setup
  const tenantId = process.env.STENO_TENANT_ID || '00000000-0000-0000-0000-000000000001';
  const scopeId = process.env.STENO_SCOPE_ID || 'default';

  try {
    await storage.createTenant({
      id: tenantId,
      name: 'Local MCP',
      slug: `local-mcp-${Date.now()}`,
      plan: 'enterprise',
      config: {},
    } as any);
  } catch {
    // Tenant already exists
  }

  // Create and start MCP server
  const server = createLocalServer({
    storage,
    embedding,
    cheapLLM,
    tenantId,
    scope: 'user',
    scopeId,
    embeddingModel,
    embeddingDim,
    domainEntityTypes: [
      {
        name: 'vehicle',
        description: 'A car, truck, motorcycle, or other vehicle owned, wanted, or discussed by the user',
        fields: [
          { name: 'make', type: 'string' as const, description: 'Manufacturer (Mercedes, BMW, Toyota, etc.)', required: false },
          { name: 'model', type: 'string' as const, description: 'Model name (E350, M3, Camry, etc.)', required: false },
          { name: 'year', type: 'string' as const, description: 'Model year', required: false },
          { name: 'ownership', type: 'string' as const, description: 'owned, wanted, previously_owned, test_driven', required: false },
        ],
      },
      {
        name: 'startup',
        description: 'A startup company discussed in context of jobs, investments, partnerships, or competition',
        fields: [
          { name: 'stage', type: 'string' as const, description: 'pre-seed, seed, series-a, series-b, growth, public', required: false },
          { name: 'relationship', type: 'string' as const, description: 'competitor, partner, prospect, employer, rejected', required: false },
          { name: 'funding', type: 'string' as const, description: 'Known funding amount or status', required: false },
        ],
      },
      {
        name: 'project',
        description: 'A software project, product, or side project the user is building or has built',
        fields: [
          { name: 'status', type: 'string' as const, description: 'active, paused, completed, abandoned', required: false },
          { name: 'tech_stack', type: 'string' as const, description: 'Primary technologies used', required: false },
          { name: 'user_role', type: 'string' as const, description: 'founder, lead, contributor, user', required: false },
        ],
      },
    ],
  });

  // Handle EPIPE gracefully — Claude Desktop may disconnect mid-response
  process.stdout.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') return; // Client disconnected, ignore
    console.error('[steno] stdout error:', err);
  });
  process.stdin.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') return;
    console.error('[steno] stdin error:', err);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

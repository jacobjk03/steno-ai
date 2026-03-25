#!/usr/bin/env node
/**
 * Steno deep codebase indexer — scans repo structure AND key source files.
 * Uses LLM to summarize architecture, patterns, and relationships.
 *
 * Usage: npx tsx hooks/index-codebase.mjs [path]
 *
 * Cost: ~$0.02-0.05 per project (gpt-4.1-mini)
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, basename, extname } from 'path';

// Load env
try {
  const envPaths = ['.env', '/Volumes/ExtSSD/WebProjects/steno/.env'];
  for (const p of envPaths) {
    try {
      const envFile = readFileSync(p, 'utf-8');
      for (const line of envFile.split('\n')) {
        const match = line.match(/^([A-Z_]+)=(.+)$/);
        if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
      }
      break;
    } catch {}
  }
} catch {}

const ROOT = process.argv[2] || process.cwd();
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PPLX_KEY = process.env.PERPLEXITY_API_KEY;
const TENANT_ID = process.env.STENO_TENANT_ID || '00000000-0000-0000-0000-000000000001';
const SCOPE_ID = process.env.STENO_SCOPE_ID || 'default';

const SKIP = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.turbo', '.cache',
  'coverage', '.DS_Store', 'pnpm-lock.yaml', 'bun.lock', 'package-lock.json',
  'yarn.lock', '__pycache__', '.venv', 'venv', 'target',
]);

const KEY_FILES = [
  'README.md', 'readme.md', 'CLAUDE.md', 'package.json', 'Cargo.toml',
  'pyproject.toml', 'requirements.txt', 'docker-compose.yml', 'Dockerfile',
  'wrangler.toml', 'vercel.json',
];

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.rb',
  '.swift', '.kt', '.vue', '.svelte',
]);

function shouldSkip(name) {
  return SKIP.has(name) || name.startsWith('._') || name.startsWith('.');
}

// Find important source files — entry points, main modules, route files
function findKeySourceFiles(root, maxFiles = 15) {
  const files = [];
  const priorityPatterns = [
    /index\.(ts|tsx|js|jsx)$/,
    /main\.(ts|tsx|js|py|rs)$/,
    /app\.(ts|tsx|js)$/,
    /server\.(ts|tsx|js)$/,
    /routes?\.(ts|tsx|js)$/,
    /schema\.(ts|sql|prisma)$/,
    /config\.(ts|js)$/,
    /lib\.rs$/,
    /mod\.rs$/,
  ];

  function walk(dir, depth = 0) {
    if (depth > 4) return;
    try {
      for (const entry of readdirSync(dir)) {
        if (shouldSkip(entry)) continue;
        const fullPath = join(dir, entry);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            walk(fullPath, depth + 1);
          } else if (stat.isFile() && CODE_EXTENSIONS.has(extname(entry))) {
            const rel = relative(root, fullPath);
            const priority = priorityPatterns.some(p => p.test(entry)) ? 0 : 1;
            files.push({ path: fullPath, rel, priority, size: stat.size });
          }
        } catch {}
      }
    } catch {}
  }

  walk(root);

  // Sort: priority files first, then by size (smaller = more likely to be important)
  files.sort((a, b) => a.priority - b.priority || a.size - b.size);
  return files.slice(0, maxFiles);
}

// Collect surface-level facts (no LLM needed)
function scanSurface(root) {
  const facts = [];
  const projectName = basename(root);

  // Package.json
  for (const name of ['package.json', 'Cargo.toml', 'pyproject.toml']) {
    const p = join(root, name);
    if (!existsSync(p)) continue;
    try {
      const content = readFileSync(p, 'utf-8');
      if (name === 'package.json') {
        const pkg = JSON.parse(content);
        if (pkg.name) facts.push(`Project name: "${pkg.name}"`);
        if (pkg.description) facts.push(`Description: ${pkg.description}`);
        const deps = Object.keys(pkg.dependencies || {});
        if (deps.length) facts.push(`Dependencies: ${deps.slice(0, 12).join(', ')}`);
        const scripts = Object.keys(pkg.scripts || {});
        if (scripts.length) facts.push(`Scripts: ${scripts.join(', ')}`);
      } else {
        facts.push(`Uses ${name === 'Cargo.toml' ? 'Rust (Cargo)' : 'Python'}`);
      }
    } catch {}
  }

  // Top-level dirs
  try {
    const dirs = readdirSync(root)
      .filter(e => !shouldSkip(e) && statSync(join(root, e)).isDirectory())
      .slice(0, 15);
    if (dirs.length) facts.push(`Directory structure: ${dirs.join(', ')}`);
  } catch {}

  return facts;
}

// LLM summarize a source file
async function summarizeFile(filePath, relPath) {
  const content = readFileSync(filePath, 'utf-8');
  // Truncate large files
  const truncated = content.slice(0, 3000);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content: `Summarize this source file in 2-4 bullet points. Focus on:
- What this file/module DOES (its purpose)
- Key functions/classes/exports
- How it connects to other parts of the codebase
- Any important patterns or architecture decisions

Be concise. Each bullet should be a standalone fact useful for a developer.
Format: Return ONLY a JSON array of strings: ["fact 1", "fact 2"]`,
        },
        {
          role: 'user',
          content: `File: ${relPath}\n\n${truncated}`,
        },
      ],
      temperature: 0,
      max_tokens: 300,
    }),
  });

  const result = await response.json();
  const text = result?.choices?.[0]?.message?.content;
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function main() {
  if (!OPENAI_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing env vars');
    process.exit(1);
  }

  const projectName = basename(ROOT);
  console.log(`\n  Deep indexing: ${projectName}`);
  console.log(`  Path: ${ROOT}\n`);

  // Phase 1: Surface scan (free)
  console.log('  Phase 1: Surface scan...');
  const surfaceFacts = scanSurface(ROOT);
  console.log(`  Found ${surfaceFacts.length} surface facts\n`);

  // Phase 2: Find key source files
  console.log('  Phase 2: Finding key source files...');
  const keyFiles = findKeySourceFiles(ROOT);
  console.log(`  Found ${keyFiles.length} key files to analyze\n`);

  // Phase 3: LLM summarize each file (~$0.002 per file)
  console.log('  Phase 3: LLM summarization...');
  const deepFacts = [];
  for (const file of keyFiles) {
    process.stdout.write(`    ${file.rel}...`);
    try {
      const fileFacts = await summarizeFile(file.path, file.rel);
      deepFacts.push(...fileFacts.map(f => `[${file.rel}] ${f}`));
      console.log(` ${fileFacts.length} facts`);
    } catch (err) {
      console.log(` error: ${err.message || err}`);
    }
  }

  const allFacts = [...surfaceFacts, ...deepFacts];
  console.log(`\n  Total: ${allFacts.length} facts (${surfaceFacts.length} surface + ${deepFacts.length} deep)\n`);

  if (allFacts.length === 0) {
    console.log('  Nothing to index.');
    return;
  }

  // Phase 4: Store through steno pipeline
  console.log('  Phase 4: Storing in steno...');

  const { createSupabaseClient, SupabaseStorageAdapter } = await import(
    '/Volumes/ExtSSD/WebProjects/steno/packages/supabase-adapter/src/index.js'
  );
  const { OpenAILLMAdapter } = await import(
    '/Volumes/ExtSSD/WebProjects/steno/packages/openai-adapter/src/index.js'
  );
  const { runExtractionPipeline } = await import(
    '/Volumes/ExtSSD/WebProjects/steno/packages/engine/src/extraction/pipeline.js'
  );

  const supabase = createSupabaseClient({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_KEY });
  const storage = new SupabaseStorageAdapter(supabase);
  const cheapLLM = new OpenAILLMAdapter({ apiKey: OPENAI_KEY, model: 'gpt-4.1-mini' });

  let embedding, embeddingModel, embeddingDim;
  if (PPLX_KEY) {
    const { PerplexityEmbeddingAdapter } = await import(
      '/Volumes/ExtSSD/WebProjects/steno/packages/engine/src/adapters/perplexity-embedding.js'
    );
    embedding = new PerplexityEmbeddingAdapter({ apiKey: PPLX_KEY, model: 'pplx-embed-v1-4b', dimensions: 2000 });
    embeddingModel = 'pplx-embed-v1-4b'; embeddingDim = 2000;
  } else {
    const { OpenAIEmbeddingAdapter } = await import(
      '/Volumes/ExtSSD/WebProjects/steno/packages/openai-adapter/src/index.js'
    );
    embedding = new OpenAIEmbeddingAdapter({ apiKey: OPENAI_KEY, model: 'text-embedding-3-large', dimensions: 3072 });
    embeddingModel = 'text-embedding-3-large'; embeddingDim = 3072;
  }

  try { await storage.createTenant({ id: TENANT_ID, name: 'Local', slug: `l-${Date.now()}`, plan: 'enterprise' }); } catch {}

  const combined = `Codebase index for ${projectName}:\n\n${allFacts.join('\n')}`;
  const result = await runExtractionPipeline(
    { storage, embedding, cheapLLM, embeddingModel, embeddingDim, extractionTier: 'auto' },
    { tenantId: TENANT_ID, scope: 'user', scopeId: SCOPE_ID, inputType: 'raw_text', data: combined },
  );

  console.log(`\n  Done! ${result.factsCreated} facts, ${result.entitiesCreated} entities, ${result.edgesCreated} edges stored.`);
  console.log(`  Cost: ~$${((keyFiles.length * 0.002) + 0.005).toFixed(3)}\n`);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });

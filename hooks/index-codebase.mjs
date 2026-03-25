#!/usr/bin/env node
/**
 * Steno codebase indexer — scans the repo and stores architecture facts.
 *
 * Usage: npx tsx hooks/index-codebase.mjs [path]
 * Default path: current working directory
 *
 * What it indexes:
 * - Package.json: name, dependencies, scripts
 * - Directory structure: key directories and their purpose
 * - README/docs: project description
 * - Config files: tsconfig, wrangler, turbo, etc.
 * - Source files: key exports, entry points
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
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const PPLX_KEY = process.env.PERPLEXITY_API_KEY;
const TENANT_ID = process.env.STENO_TENANT_ID || '00000000-0000-0000-0000-000000000001';
const SCOPE_ID = process.env.STENO_SCOPE_ID || 'default';

// Files/dirs to skip
const SKIP = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.turbo',
  '.cache', 'coverage', '.DS_Store', 'pnpm-lock.yaml', 'bun.lock',
  'package-lock.json', 'yarn.lock',
]);

function shouldSkip(name) {
  return SKIP.has(name) || name.startsWith('._');
}

// Collect project facts from filesystem
function scanProject(root) {
  const facts = [];
  const projectName = basename(root);

  // 1. Package.json
  const pkgPath = join(root, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.name) facts.push(`The project is named "${pkg.name}"`);
      if (pkg.description) facts.push(`Project description: ${pkg.description}`);
      if (pkg.scripts) {
        const scripts = Object.keys(pkg.scripts).slice(0, 10).join(', ');
        facts.push(`Available npm scripts: ${scripts}`);
      }
      const deps = Object.keys(pkg.dependencies || {});
      if (deps.length > 0) {
        facts.push(`Key dependencies: ${deps.slice(0, 15).join(', ')}${deps.length > 15 ? ` (+${deps.length - 15} more)` : ''}`);
      }
    } catch {}
  }

  // 2. README
  for (const name of ['README.md', 'readme.md', 'README']) {
    const readmePath = join(root, name);
    if (existsSync(readmePath)) {
      try {
        const content = readFileSync(readmePath, 'utf-8').slice(0, 2000);
        const firstParagraph = content.split('\n\n').slice(0, 3).join('\n').trim();
        if (firstParagraph.length > 20) {
          facts.push(`README summary: ${firstParagraph.slice(0, 500)}`);
        }
      } catch {}
      break;
    }
  }

  // 3. Config files
  const configs = {
    'tsconfig.json': 'TypeScript',
    'tsconfig.base.json': 'TypeScript (base config)',
    'turbo.json': 'Turborepo monorepo',
    'wrangler.toml': 'Cloudflare Workers',
    'next.config.js': 'Next.js',
    'next.config.ts': 'Next.js',
    'vite.config.ts': 'Vite',
    'vitest.config.ts': 'Vitest testing',
    '.eslintrc.json': 'ESLint',
    'tailwind.config.ts': 'Tailwind CSS',
    'drizzle.config.ts': 'Drizzle ORM',
    'pnpm-workspace.yaml': 'pnpm workspace (monorepo)',
  };

  const foundConfigs = [];
  for (const [file, tech] of Object.entries(configs)) {
    if (existsSync(join(root, file))) foundConfigs.push(tech);
  }
  if (foundConfigs.length > 0) {
    facts.push(`Tech stack detected: ${foundConfigs.join(', ')}`);
  }

  // 4. Directory structure (top 2 levels)
  const dirs = [];
  try {
    for (const entry of readdirSync(root)) {
      if (shouldSkip(entry)) continue;
      const entryPath = join(root, entry);
      try {
        if (statSync(entryPath).isDirectory()) {
          dirs.push(entry);
          // Second level
          try {
            const subDirs = readdirSync(entryPath)
              .filter(e => !shouldSkip(e) && statSync(join(entryPath, e)).isDirectory())
              .slice(0, 10);
            if (subDirs.length > 0) {
              facts.push(`${entry}/ contains: ${subDirs.join(', ')}`);
            }
          } catch {}
        }
      } catch {}
    }
    if (dirs.length > 0) {
      facts.push(`Top-level directories: ${dirs.join(', ')}`);
    }
  } catch {}

  // 5. Workspace packages (monorepo)
  const workspaceDirs = ['packages', 'apps'];
  for (const wsDir of workspaceDirs) {
    const wsPath = join(root, wsDir);
    if (!existsSync(wsPath)) continue;
    try {
      const pkgs = readdirSync(wsPath).filter(e => {
        if (shouldSkip(e)) return false;
        try { return statSync(join(wsPath, e)).isDirectory(); } catch { return false; }
      });
      for (const pkg of pkgs) {
        const pkgJsonPath = join(wsPath, pkg, 'package.json');
        if (existsSync(pkgJsonPath)) {
          try {
            const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
            const desc = pkgJson.description || '';
            facts.push(`${wsDir}/${pkg}: ${pkgJson.name || pkg}${desc ? ` — ${desc}` : ''}`);

            // Check for key source files
            const srcDir = join(wsPath, pkg, 'src');
            if (existsSync(srcDir)) {
              try {
                const srcFiles = readdirSync(srcDir)
                  .filter(f => f.endsWith('.ts') || f.endsWith('.tsx'))
                  .slice(0, 8);
                if (srcFiles.length > 0) {
                  facts.push(`${wsDir}/${pkg}/src/ entry files: ${srcFiles.join(', ')}`);
                }
              } catch {}
            }
          } catch {}
        }
      }
    } catch {}
  }

  // 6. Key source directories
  const srcDirs = ['src', 'app', 'lib', 'components', 'utils', 'api'];
  for (const dir of srcDirs) {
    const dirPath = join(root, dir);
    if (!existsSync(dirPath)) continue;
    try {
      const entries = readdirSync(dirPath).filter(e => !shouldSkip(e)).slice(0, 15);
      const subDirs = entries.filter(e => {
        try { return statSync(join(dirPath, e)).isDirectory(); } catch { return false; }
      });
      const files = entries.filter(e => {
        try { return statSync(join(dirPath, e)).isFile(); } catch { return false; }
      });
      if (subDirs.length > 0) {
        facts.push(`${dir}/ subdirectories: ${subDirs.join(', ')}`);
      }
    } catch {}
  }

  return facts;
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) {
    console.error('Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY');
    process.exit(1);
  }

  console.log(`Scanning ${ROOT}...`);
  const facts = scanProject(ROOT);
  console.log(`Found ${facts.length} facts about the codebase.`);

  if (facts.length === 0) {
    console.log('Nothing to index.');
    return;
  }

  // Print facts for review
  for (const f of facts) {
    console.log(`  - ${f}`);
  }

  // Store via steno extraction pipeline
  console.log('\nStoring in steno...');

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

  let embedding;
  let embeddingModel, embeddingDim;
  if (PPLX_KEY) {
    const { PerplexityEmbeddingAdapter } = await import(
      '/Volumes/ExtSSD/WebProjects/steno/packages/engine/src/adapters/perplexity-embedding.js'
    );
    embedding = new PerplexityEmbeddingAdapter({ apiKey: PPLX_KEY, model: 'pplx-embed-v1-4b', dimensions: 2000 });
    embeddingModel = 'pplx-embed-v1-4b';
    embeddingDim = 2000;
  } else {
    const { OpenAIEmbeddingAdapter } = await import(
      '/Volumes/ExtSSD/WebProjects/steno/packages/openai-adapter/src/index.js'
    );
    embedding = new OpenAIEmbeddingAdapter({ apiKey: OPENAI_KEY, model: 'text-embedding-3-large', dimensions: 3072 });
    embeddingModel = 'text-embedding-3-large';
    embeddingDim = 3072;
  }

  // Ensure tenant exists
  try {
    await storage.createTenant({ id: TENANT_ID, name: 'Local MCP', slug: `local-${Date.now()}`, plan: 'enterprise' });
  } catch {}

  // Feed all facts through the extraction pipeline as a single document
  const combinedText = `Codebase architecture and structure for ${basename(ROOT)}:\n\n${facts.join('\n')}`;

  const result = await runExtractionPipeline(
    { storage, embedding, cheapLLM, embeddingModel, embeddingDim, extractionTier: 'auto' },
    { tenantId: TENANT_ID, scope: 'user', scopeId: SCOPE_ID, inputType: 'raw_text', data: combinedText },
  );

  console.log(`\nDone! Stored ${result.factsCreated} facts, ${result.entitiesCreated} entities, ${result.edgesCreated} edges.`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

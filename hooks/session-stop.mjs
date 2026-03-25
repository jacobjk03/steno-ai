#!/usr/bin/env node
/**
 * Steno Stop hook — auto-captures conversation into memory.
 * Finds the transcript file, extracts signal turns, stores through steno pipeline.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Load env
try {
  const envFile = readFileSync('/Volumes/ExtSSD/WebProjects/steno/.env', 'utf-8');
  for (const line of envFile.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.+)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
} catch {}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const PPLX_KEY = process.env.PERPLEXITY_API_KEY;
const TENANT_ID = process.env.STENO_TENANT_ID || '00000000-0000-0000-0000-000000000001';
const SCOPE_ID = process.env.STENO_SCOPE_ID || 'default';
const TRACKER_DIR = join(homedir(), '.steno-claude', 'trackers');

const SIGNAL_KEYWORDS = [
  'remember', 'don\'t forget', 'note that', 'important',
  'decided', 'chose', 'architecture', 'design', 'decision',
  'bug', 'fix', 'fixed', 'solved', 'solution',
  'prefer', 'always', 'never', 'pattern',
  'refactor', 'migrate', 'tradeoff',
  'deploy', 'shipped', 'launched',
  'learned', 'realized', 'discovered', 'turns out',
  'my name', 'i am', 'i\'m a', 'i work', 'i like', 'i hate',
];

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) return;

  // Read stdin for hook input
  let hookInput = {};
  try {
    let input = '';
    for await (const chunk of process.stdin) { input += chunk; }
    if (input.trim()) hookInput = JSON.parse(input);
  } catch {}

  const sessionId = hookInput.session_id;
  const cwd = hookInput.cwd || process.cwd();

  // Find the transcript file
  let transcriptPath = hookInput.transcript_path;
  if (!transcriptPath) {
    // Auto-find: look in ~/.claude/projects/<sanitized-cwd>/
    const sanitized = cwd.replace(/\//g, '-').replace(/^-/, '');
    const projectDir = join(homedir(), '.claude', 'projects', sanitized);
    if (existsSync(projectDir)) {
      // Find the most recently modified .jsonl file
      try {
        const files = readdirSync(projectDir)
          .filter(f => f.endsWith('.jsonl') && !f.includes('subagent') && !f.includes('skill'))
          .map(f => ({ name: f, mtime: statSync(join(projectDir, f)).mtimeMs }))
          .sort((a, b) => b.mtime - a.mtime);
        if (files.length > 0) {
          transcriptPath = join(projectDir, files[0].name);
        }
      } catch {}
    }
  }

  if (!transcriptPath || !existsSync(transcriptPath)) return;

  // Read and parse JSONL transcript
  let entries;
  try {
    entries = readFileSync(transcriptPath, 'utf-8').trim().split('\n')
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
  } catch { return; }

  if (entries.length === 0) return;

  // Track incremental capture
  mkdirSync(TRACKER_DIR, { recursive: true });
  const trackerId = sessionId || transcriptPath.split('/').pop().replace('.jsonl', '');
  const trackerFile = join(TRACKER_DIR, `${trackerId}.txt`);
  let lastUuid = null;
  try { lastUuid = readFileSync(trackerFile, 'utf-8').trim(); } catch {}

  // Skip already-captured entries
  let startIdx = 0;
  if (lastUuid) {
    const idx = entries.findIndex(e => e.uuid === lastUuid);
    if (idx >= 0) startIdx = idx + 1;
  }

  // Extract human/assistant turns
  const turns = [];
  let currentTurn = null;
  for (const entry of entries.slice(startIdx)) {
    const type = entry.type;
    if (type === 'human') {
      if (currentTurn) turns.push(currentTurn);
      currentTurn = { user: extractText(entry), assistant: '' };
    } else if (type === 'assistant' && currentTurn) {
      currentTurn.assistant += ' ' + extractText(entry);
    }
  }
  if (currentTurn && currentTurn.user) turns.push(currentTurn);

  if (turns.length === 0) return;

  // Signal extraction — only capture turns with important keywords
  const captured = new Set();
  const signalTurns = [];
  for (let i = 0; i < turns.length; i++) {
    const combined = (turns[i].user + ' ' + turns[i].assistant).toLowerCase();
    if (SIGNAL_KEYWORDS.some(kw => combined.includes(kw))) {
      for (let j = Math.max(0, i - 1); j <= i; j++) {
        if (!captured.has(j)) {
          captured.add(j);
          signalTurns.push(turns[j]);
        }
      }
    }
  }

  // If no signals, capture last 2 turns as fallback
  const toCapture = signalTurns.length > 0 ? signalTurns : turns.slice(-2);

  const formatted = toCapture.map(t => {
    const user = clean(t.user).slice(0, 300);
    const asst = compress(clean(t.assistant)).slice(0, 300);
    return `user: ${user}\nassistant: ${asst}`;
  }).join('\n\n');

  if (formatted.length < 30) return;

  // Store through steno extraction pipeline
  try {
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

    await runExtractionPipeline(
      { storage, embedding, cheapLLM, embeddingModel, embeddingDim, extractionTier: 'auto' },
      { tenantId: TENANT_ID, scope: 'user', scopeId: SCOPE_ID, inputType: 'raw_text', data: formatted },
    );
  } catch {}

  // Update tracker
  const lastEntry = entries[entries.length - 1];
  if (lastEntry?.uuid) {
    try { writeFileSync(trackerFile, lastEntry.uuid); } catch {}
  }
}

function extractText(entry) {
  const msg = entry?.message;
  if (!msg) return '';
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter(b => b.type === 'text' && !b.text?.includes('<system-reminder>'))
      .map(b => b.text || '').join(' ');
  }
  return '';
}

function clean(text) {
  return text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<steno-memory>[\s\S]*?<\/steno-memory>/g, '')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function compress(text) {
  return text
    .replace(/Read\([^)]+\)[\s\S]*?(?=\n\n|\n[A-Z]|$)/g, '[read file]')
    .replace(/Edit\([^)]+\)[\s\S]*?(?=\n\n|\n[A-Z]|$)/g, '[edited file]')
    .replace(/Write\([^)]+\)[\s\S]*?(?=\n\n|\n[A-Z]|$)/g, '[wrote file]')
    .replace(/Bash\([^)]+\)[\s\S]*?(?=\n\n|\n[A-Z]|$)/g, '[ran command]')
    .replace(/Search\([^)]+\)[\s\S]*?(?=\n\n|\n[A-Z]|$)/g, '[searched]')
    .trim();
}

main();

#!/usr/bin/env node
/**
 * Steno Stop hook — auto-captures conversation into memory.
 * Mirrors Supermemory's summary-hook but stores through steno's extraction pipeline.
 *
 * Signal extraction: only captures turns around important keywords to save tokens.
 * Incremental: tracks last captured position, never re-sends old content.
 *
 * Reads: { cwd, session_id, transcript_path } from stdin
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
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
  'remember', 'don\'t forget', 'keep in mind', 'note that', 'important',
  'decision', 'decided', 'chose', 'architecture', 'design',
  'bug', 'fix', 'fixed', 'solved', 'solution', 'workaround',
  'preference', 'prefer', 'always', 'never', 'pattern',
  'refactor', 'migrate', 'tradeoff', 'trade-off',
  'deploy', 'shipped', 'launched', 'released',
  'learned', 'realized', 'discovered', 'turns out',
  'my name', 'i am', 'i\'m a', 'i work', 'i like', 'i hate', 'i prefer',
];
const SIGNAL_TURNS_BEFORE = 2;
const MAX_CONTENT_LENGTH = 100;

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) return;

  // Read stdin
  let hookInput = {};
  try {
    let input = '';
    for await (const chunk of process.stdin) { input += chunk; }
    if (input.trim()) hookInput = JSON.parse(input);
  } catch {}

  const transcriptPath = hookInput.transcript_path;
  const sessionId = hookInput.session_id || 'unknown';

  if (!transcriptPath || !existsSync(transcriptPath)) return;

  // Read transcript (JSONL format)
  let entries;
  try {
    const raw = readFileSync(transcriptPath, 'utf-8').trim();
    entries = raw.split('\n').map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch { return; }

  if (entries.length === 0) return;

  // Load tracker — skip already-captured entries
  mkdirSync(TRACKER_DIR, { recursive: true });
  const trackerFile = join(TRACKER_DIR, `${sessionId}.txt`);
  let lastCapturedUuid = null;
  try {
    lastCapturedUuid = readFileSync(trackerFile, 'utf-8').trim();
  } catch {}

  // Find new entries after last captured
  let startIdx = 0;
  if (lastCapturedUuid) {
    const idx = entries.findIndex(e => e.uuid === lastCapturedUuid);
    if (idx >= 0) startIdx = idx + 1;
  }
  const newEntries = entries.slice(startIdx);
  if (newEntries.length === 0) return;

  // Group into turns (user message + assistant response)
  const turns = [];
  let currentTurn = null;
  for (const entry of newEntries) {
    if (entry.type === 'human' || entry.type === 'user') {
      if (currentTurn) turns.push(currentTurn);
      currentTurn = { user: extractText(entry), assistant: '', timestamp: entry.timestamp };
    } else if ((entry.type === 'assistant' || entry.type === 'ai') && currentTurn) {
      currentTurn.assistant += extractText(entry);
    }
  }
  if (currentTurn) turns.push(currentTurn);

  if (turns.length === 0) return;

  // Signal extraction — only capture turns around important keywords
  const signalTurns = [];
  const capturedIndices = new Set();

  for (let i = 0; i < turns.length; i++) {
    const text = (turns[i].user + ' ' + turns[i].assistant).toLowerCase();
    const hasSignal = SIGNAL_KEYWORDS.some(kw => text.includes(kw));
    if (hasSignal) {
      // Capture this turn + N turns before for context
      for (let j = Math.max(0, i - SIGNAL_TURNS_BEFORE); j <= i; j++) {
        if (!capturedIndices.has(j)) {
          capturedIndices.add(j);
          signalTurns.push(turns[j]);
        }
      }
    }
  }

  // If no signals found, capture last 3 turns as fallback
  const turnsToCapture = signalTurns.length > 0 ? signalTurns : turns.slice(-3);

  // Format for extraction — compress tool outputs
  const formatted = turnsToCapture.map(t => {
    const user = t.user.slice(0, 500);
    const assistant = compressAssistant(t.assistant).slice(0, 500);
    return `user: ${user}\nassistant: ${assistant}`;
  }).join('\n\n');

  if (formatted.length < 50) return;

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

    try {
      await storage.createTenant({ id: TENANT_ID, name: 'Local MCP', slug: `local-${Date.now()}`, plan: 'enterprise' });
    } catch {}

    await runExtractionPipeline(
      { storage, embedding, cheapLLM, embeddingModel, embeddingDim, extractionTier: 'auto' },
      { tenantId: TENANT_ID, scope: 'user', scopeId: SCOPE_ID, inputType: 'raw_text', data: formatted },
    );
  } catch {}

  // Update tracker
  const lastEntry = newEntries[newEntries.length - 1];
  if (lastEntry?.uuid) {
    try { writeFileSync(trackerFile, lastEntry.uuid); } catch {}
  }
}

function extractText(entry) {
  if (!entry.message) return '';
  const msg = entry.message;
  if (typeof msg.content === 'string') return cleanContent(msg.content);
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter(b => b.type === 'text')
      .map(b => cleanContent(b.text || ''))
      .join(' ');
  }
  return '';
}

function cleanContent(text) {
  // Strip system reminders and memory context tags
  return text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<steno-memory>[\s\S]*?<\/steno-memory>/g, '')
    .replace(/<supermemory-context>[\s\S]*?<\/supermemory-context>/g, '')
    .trim();
}

function compressAssistant(text) {
  // Compress tool outputs to save tokens
  return text
    .replace(/Read\([^)]+\)\n\s*└ Read \d+ lines/g, '[read file]')
    .replace(/Edit\([^)]+\)/g, '[edited file]')
    .replace(/Write\([^)]+\)/g, '[wrote file]')
    .replace(/Bash\([^)]+\)[\s\S]*?(?=\n\n|\n[A-Z]|$)/g, '[ran command]')
    .replace(/Search\([^)]+\)\n\s*└ Found \d+ files/g, '[searched files]')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

main();

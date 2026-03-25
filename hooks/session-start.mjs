#!/usr/bin/env node
/**
 * Steno SessionStart hook — injects user profile + relevant memories.
 * Mirrors Supermemory's context-hook but uses steno's 5-signal fusion search.
 *
 * Reads: { cwd, session_id, transcript_path } from stdin
 * Outputs: { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "..." } }
 */
import { readFileSync } from 'fs';
import { basename } from 'path';
import { createHash } from 'crypto';

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
const TENANT_ID = process.env.STENO_TENANT_ID || '00000000-0000-0000-0000-000000000001';
const SCOPE_ID = process.env.STENO_SCOPE_ID || 'default';
const MAX_PROFILE_ITEMS = 10;
const MAX_PROJECT_ITEMS = 5;
const MAX_PROFILE_FACT_LENGTH = 150;
const MAX_PROJECT_FACT_LENGTH = 250; // architecture facts can be longer

function output(additionalContext) {
  console.log(JSON.stringify(additionalContext ? { additionalContext } : {}));
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    output(null);
    return;
  }

  // Read stdin for hook context
  let hookInput = {};
  try {
    let input = '';
    for await (const chunk of process.stdin) { input += chunk; }
    if (input.trim()) hookInput = JSON.parse(input);
  } catch {}

  const cwd = hookInput.cwd || process.cwd();
  const projectName = basename(cwd);
  const projectHash = createHash('sha256').update(cwd).digest('hex').slice(0, 16);
  const projectScopeId = `project_${projectHash}`;

  try {
    // Use Supabase REST API directly — zero deps
    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    };

    // Fetch in parallel: personal profile + project-specific facts
    const [personalRes, projectRes] = await Promise.all([
      // Personal: top facts by importance (identity, preferences, decisions)
      fetch(
        `${SUPABASE_URL}/rest/v1/facts?tenant_id=eq.${TENANT_ID}&scope=eq.user&scope_id=eq.${SCOPE_ID}&valid_until=is.null&importance=gte.0.6&select=content,importance&order=importance.desc,created_at.desc&limit=${MAX_PROFILE_ITEMS}`,
        { headers },
      ),
      // Project: facts matching the current project name (use % wildcard for ilike)
      fetch(
        `${SUPABASE_URL}/rest/v1/facts?tenant_id=eq.${TENANT_ID}&scope=eq.user&scope_id=eq.${SCOPE_ID}&valid_until=is.null&select=content,importance&content=ilike.%25${encodeURIComponent(projectName)}%25&order=importance.desc,created_at.desc&limit=8`,
        { headers },
      ),
    ]);

    const personalFacts = personalRes.ok ? await personalRes.json() : [];
    const projectFacts = projectRes.ok ? await projectRes.json() : [];

    if (personalFacts.length === 0 && projectFacts.length === 0) {
      output(null);
      return;
    }

    // Deduplicate
    const seen = new Set();
    const dedup = (facts) => facts.filter(f => {
      const key = f.content.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const personal = dedup(personalFacts).filter(f => f.content.length <= MAX_PROFILE_FACT_LENGTH);
    const project = dedup(projectFacts).filter(f => f.content.length <= MAX_PROJECT_FACT_LENGTH);

    // Build context block
    let context = '<steno-memory>\n';

    if (personal.length > 0) {
      context += '## User Profile\n';
      context += personal.map(f => `- ${f.content}`).join('\n');
      context += '\n\n';
    }

    if (project.length > 0) {
      context += `## Project Context (${projectName})\n`;
      context += project.map(f => `- ${f.content}`).join('\n');
      context += '\n\n';
    }

    context += `## Memory Instructions (IMPORTANT)
- Do NOT use the built-in auto memory system (Write to .claude/memory/). Use steno instead.
- When the user shares personal info, preferences, decisions, or anything worth remembering → call steno_remember immediately.
- When you need context about the user, past decisions, or previous work → call steno_recall to search.
- When answering questions about the user's preferences or history → call steno_recall FIRST before guessing.
- For architecture questions about the CURRENT project, trust the Project Context above before reading files. Only read files if the memory doesn't cover the question.
- Reference injected memories above naturally. Don't mention "steno" unless asked.
</steno-memory>`;

    output(context);
  } catch {
    output(null);
  }
}

main();

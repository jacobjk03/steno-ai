#!/usr/bin/env node

/**
 * OpenClaw hook that provides Steno memory tools.
 * Reads STENO_API_KEY from environment.
 */

const STENO_API_KEY = process.env.STENO_API_KEY;
const STENO_BASE_URL = process.env.STENO_BASE_URL || 'https://api.steno.ai';
const USER_ID = process.env.STENO_USER_ID || 'openclaw-default';

if (!STENO_API_KEY) {
  console.error('[steno] STENO_API_KEY not set. Memory disabled.');
  process.exit(0);
}

async function stenoRequest(method, path, body) {
  const res = await fetch(`${STENO_BASE_URL}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${STENO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Steno API error (${res.status}): ${error}`);
  }

  return res.json();
}

// Tool handlers
async function remember(content) {
  const result = await stenoRequest('POST', '/v1/memory', {
    scope: 'user',
    scope_id: USER_ID,
    input_type: 'raw_text',
    data: content,
  });
  return `Remembered. (extraction: ${result.data?.extraction_id || 'ok'})`;
}

async function recall(query) {
  const result = await stenoRequest('POST', '/v1/memory/search', {
    query,
    scope: 'user',
    scope_id: USER_ID,
    limit: 5,
  });

  const memories = result.data?.results || [];
  if (memories.length === 0) return 'No relevant memories found.';

  return memories.map((m, i) => `${i + 1}. ${m.content || m.fact?.content || 'Unknown'}`).join('\n');
}

async function feedback(factId, useful) {
  await stenoRequest('POST', '/v1/feedback', {
    fact_id: factId,
    was_useful: useful,
    feedback_type: useful ? 'explicit_positive' : 'explicit_negative',
  });
  return `Feedback recorded: ${useful ? 'positive' : 'negative'}`;
}

// Read command from stdin (OpenClaw protocol)
const input = await new Promise(resolve => {
  let data = '';
  process.stdin.on('data', chunk => data += chunk);
  process.stdin.on('end', () => resolve(data));
});

try {
  const command = JSON.parse(input);
  let result;

  switch (command.tool) {
    case 'steno_remember':
      result = await remember(command.parameters.content);
      break;
    case 'steno_recall':
      result = await recall(command.parameters.query);
      break;
    case 'steno_feedback':
      result = await feedback(command.parameters.fact_id, command.parameters.useful);
      break;
    default:
      result = `Unknown tool: ${command.tool}`;
  }

  console.log(JSON.stringify({ result }));
} catch (err) {
  console.log(JSON.stringify({ error: err.message }));
}

#!/usr/bin/env node
/**
 * Steno session stop hook — auto-saves conversation summary after each session.
 * Runs on: Stop event
 *
 * Reads the conversation transcript from stdin and extracts key facts.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TENANT_ID = process.env.STENO_TENANT_ID || '00000000-0000-0000-0000-000000000001';
const SCOPE_ID = process.env.STENO_SCOPE_ID || 'default';

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_API_KEY) {
    return;
  }

  // Read hook input from stdin
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let hookData;
  try {
    hookData = JSON.parse(input);
  } catch {
    return;
  }

  // Get the transcript/summary from the stop event
  const transcript = hookData?.transcript || hookData?.summary || '';
  if (!transcript || transcript.length < 50) {
    return; // Too short to be useful
  }

  // Use OpenAI to extract key facts from the session
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          {
            role: 'system',
            content: `Extract 3-8 key facts worth remembering from this coding session transcript. Focus on:
- User preferences discovered (coding style, tools, frameworks)
- Decisions made (architecture choices, library selections)
- Problems encountered and solutions found
- Project context (what they're building, tech stack)

Return ONLY a JSON array of strings: ["fact 1", "fact 2", ...]
Skip trivial facts. Only include things worth remembering for future sessions.
If nothing worth remembering, return [].`,
          },
          {
            role: 'user',
            content: transcript.slice(0, 4000), // Limit to save tokens
          },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });

    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content;
    if (!content) return;

    let facts;
    try {
      const parsed = JSON.parse(content);
      facts = Array.isArray(parsed) ? parsed : parsed.facts || [];
    } catch {
      return;
    }

    if (facts.length === 0) return;

    // Store via the extraction pipeline (call steno_remember equivalent)
    // We'll use a simple direct insert since we can't easily import the full pipeline here
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const combinedText = facts.join('\n');

    // Insert as a single extraction text — the pipeline will handle fact splitting
    // For now, just store the raw facts directly
    for (const fact of facts) {
      const id = crypto.randomUUID();
      await supabase.from('facts').insert({
        id,
        tenant_id: TENANT_ID,
        scope: 'user',
        scope_id: SCOPE_ID,
        content: fact,
        lineage_id: crypto.randomUUID(),
        importance: 0.6,
        confidence: 0.8,
        operation: 'create',
        source_type: 'conversation',
        modality: 'text',
        tags: ['auto-capture', 'session'],
        metadata: { capturedAt: new Date().toISOString() },
        contradiction_status: 'none',
      });
    }
  } catch {
    // Silent failure — don't break the session end
  }
}

main();

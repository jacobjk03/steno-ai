/**
 * Quick test of @steno-ai/local (embeddable mode)
 * Uses SQLite + mocked LLM (no external services needed)
 */

import { createStenoLocal } from '../packages/local/src/index.js';

async function main() {
  console.log('=== STENO LOCAL MODE TEST ===\n');

  // Create local Steno instance with SQLite
  // Using a temp file so it persists across the test
  const steno = createStenoLocal({
    dbPath: '/tmp/steno-local-test.db',
    llm: {
      baseUrl: 'http://localhost:11434/v1', // Ollama (won't connect — that's ok for this test)
      model: 'mistral',
    },
    embedding: {
      baseUrl: 'http://localhost:11434/v1',
      model: 'nomic-embed-text',
      dimensions: 768,
    },
    extractionTier: 'heuristic_only', // Skip LLM — use only regex/NER extraction
  });

  console.log('1. Created local Steno instance (SQLite + heuristic-only mode)\n');

  // Test memory.add with heuristic extraction (no LLM needed)
  console.log('2. Adding memories (heuristic extraction — no LLM)...');
  try {
    const result1 = await steno.memory.add({
      scope: 'user',
      scopeId: 'test_user',
      data: "Hi, I'm Alex. I work at Google as a software engineer. I'm allergic to peanuts and I love playing guitar.",
      inputType: 'raw_text',
    });
    console.log(`   ✓ Added memory: ${result1.factsCreated} facts extracted`);
  } catch (err) {
    console.log(`   ✗ Error: ${err instanceof Error ? err.message : err}`);
  }

  try {
    const result2 = await steno.memory.add({
      scope: 'user',
      scopeId: 'test_user',
      data: "I prefer dark mode in all my apps and I live in San Francisco. My email is alex@google.com",
      inputType: 'raw_text',
    });
    console.log(`   ✓ Added memory: ${result2.factsCreated} facts extracted`);
  } catch (err) {
    console.log(`   ✗ Error: ${err instanceof Error ? err.message : err}`);
  }

  // Test memory.list
  console.log('\n3. Listing memories...');
  try {
    const facts = await steno.memory.list({ scope: 'user', scopeId: 'test_user' });
    console.log(`   ✓ ${facts.data.length} facts stored`);
    for (const fact of facts.data.slice(0, 5)) {
      console.log(`     - [${fact.importance.toFixed(2)}] ${fact.content}`);
    }
    if (facts.data.length > 5) console.log(`     ... and ${facts.data.length - 5} more`);
  } catch (err) {
    console.log(`   ✗ Error: ${err instanceof Error ? err.message : err}`);
  }

  // Test sessions
  console.log('\n4. Testing sessions...');
  try {
    const session = await steno.sessions.start({ scope: 'user', scopeId: 'test_user' });
    console.log(`   ✓ Session started: ${session.id}`);

    const sessions = await steno.sessions.list({ scope: 'user', scopeId: 'test_user' });
    console.log(`   ✓ ${sessions.data.length} sessions found`);
  } catch (err) {
    console.log(`   ✗ Error: ${err instanceof Error ? err.message : err}`);
  }

  // Test triggers
  console.log('\n5. Testing triggers...');
  try {
    const trigger = await steno.triggers.create({
      scope: 'user',
      scopeId: 'test_user',
      condition: { topic_match: ['food', 'dinner', 'restaurant'] },
      priority: 10,
    });
    console.log(`   ✓ Trigger created: ${trigger.id}`);

    const triggers = await steno.triggers.list('user', 'test_user');
    console.log(`   ✓ ${triggers.length} triggers active`);
  } catch (err) {
    console.log(`   ✗ Error: ${err instanceof Error ? err.message : err}`);
  }

  // Test graph
  console.log('\n6. Testing graph/entities...');
  try {
    const entities = await steno.graph.listEntities();
    console.log(`   ✓ ${entities.data.length} entities in graph`);
    for (const e of entities.data.slice(0, 5)) {
      console.log(`     - ${e.name} (${e.entityType})`);
    }
  } catch (err) {
    console.log(`   ✗ Error: ${err instanceof Error ? err.message : err}`);
  }

  // Test export
  console.log('\n7. Testing export...');
  try {
    const exported = await steno.export('user', 'test_user');
    console.log(`   ✓ Exported: ${exported.facts?.length ?? 0} facts, ${exported.entities?.length ?? 0} entities, ${exported.sessions?.length ?? 0} sessions`);
  } catch (err) {
    console.log(`   ✗ Error: ${err instanceof Error ? err.message : err}`);
  }

  // Cleanup
  console.log('\n8. Cleanup...');
  try {
    const purged = await steno.memory.purge('user', 'test_user');
    console.log(`   ✓ Purged ${purged} facts`);
  } catch (err) {
    console.log(`   ✗ Error: ${err instanceof Error ? err.message : err}`);
  }

  steno.close();
  console.log('\n✅ LOCAL MODE TEST COMPLETE');

  // Clean up temp db
  const fs = await import('node:fs');
  try { fs.unlinkSync('/tmp/steno-local-test.db'); } catch {}
}

main().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});

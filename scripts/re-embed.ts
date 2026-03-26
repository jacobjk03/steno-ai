/**
 * Re-embed all facts with contextual wrapper.
 * For facts WITH sourceChunk: use "Context: <sourceChunk> | Fact: <content>"
 * For facts WITHOUT sourceChunk: use "Context: <content[:200]> | Fact: <content>"
 *
 * This improves retrieval for older facts that were embedded without context.
 *
 * Usage: set -a && source .env && set +a && bun scripts/re-embed.ts
 */

import { createSupabaseClient } from '../packages/supabase-adapter/src/index.ts';

const BATCH_SIZE = 50; // Perplexity embedding batch limit

const supabase = createSupabaseClient({ url: process.env.SUPABASE_URL!, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY! });
const client = (supabase as any);

// Use Perplexity for embeddings (matches existing embedding model)
function decodeAndNormalize(b64String: string): number[] {
  const binaryStr = atob(b64String);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  const int8 = new Int8Array(bytes.buffer);
  const float32 = new Array<number>(int8.length);
  let norm = 0;
  for (let i = 0; i < int8.length; i++) { float32[i] = int8[i]!; norm += float32[i]! * float32[i]!; }
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < float32.length; i++) float32[i] = float32[i]! / norm;
  return float32;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const response = await fetch('https://api.perplexity.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'pplx-embed-v1-4b',
      input: texts,
      dimensions: 2000,
    }),
  });

  if (!response.ok) {
    throw new Error(`Perplexity embedding failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json() as { data: Array<{ embedding: string; index: number }> };
  const sorted = data.data.sort((a, b) => a.index - b.index);
  return sorted.map(d => decodeAndNormalize(d.embedding));
}

async function main() {
  // Get all non-scratchpad facts
  let allFacts: Array<{ id: string; content: string; source_chunk: string | null }> = [];
  let offset = 0;

  while (true) {
    const { data, error } = await client
      .from('facts')
      .select('id, content, source_chunk')
      .not('tags', 'cs', '{"scratchpad"}')
      .order('created_at', { ascending: true })
      .range(offset, offset + 999);

    if (error) { console.error('Fetch error:', error.message); break; }
    if (!data || data.length === 0) break;
    allFacts.push(...data);
    offset += data.length;
    if (data.length < 1000) break;
  }

  console.log(`Found ${allFacts.length} facts to re-embed`);

  let processed = 0;
  let errors = 0;

  for (let i = 0; i < allFacts.length; i += BATCH_SIZE) {
    const batch = allFacts.slice(i, i + BATCH_SIZE);

    // Build contextual content for each fact
    const contextualTexts = batch.map(f => {
      if (f.source_chunk) {
        const ctx = f.source_chunk.length > 200 ? f.source_chunk.slice(0, 200) + '...' : f.source_chunk;
        return `Context: ${ctx} | Fact: ${f.content}`;
      }
      // No source chunk — use the fact content itself as context
      const ctx = f.content.length > 200 ? f.content.slice(0, 200) + '...' : f.content;
      return `Context: ${ctx} | Fact: ${f.content}`;
    });

    try {
      const embeddings = await embedBatch(contextualTexts);

      // Update each fact's embedding
      for (let j = 0; j < batch.length; j++) {
        const fact = batch[j]!;
        const embedding = embeddings[j]!;

        // pgvector expects array format: [0.1, 0.2, ...]
        const vectorStr = `[${embedding.join(',')}]`;
        const { error } = await client
          .from('facts')
          .update({ embedding: vectorStr })
          .eq('id', fact.id);

        if (error) {
          console.error(`Failed to update ${fact.id}:`, error.message);
          errors++;
        } else {
          processed++;
        }
      }

      console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${processed}/${allFacts.length} (${errors} errors)`);

      // Rate limit — 1 second between batches
      if (i + BATCH_SIZE < allFacts.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (err: any) {
      console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, err.message);
      errors += batch.length;
    }
  }

  console.log(`\nDone: ${processed} re-embedded, ${errors} errors`);
}

main().catch(console.error);

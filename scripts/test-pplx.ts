import { PerplexityEmbeddingAdapter } from '../packages/engine/src/adapters/perplexity-embedding.js';
import { config } from 'dotenv';
config({ path: '.env' });

const p = new PerplexityEmbeddingAdapter({ apiKey: process.env.PERPLEXITY_API_KEY! });

async function main() {
  const single = await p.embed('Where does the user work?');
  console.log('embed() - IsArray:', Array.isArray(single), 'Length:', single.length, 'First3:', single.slice(0, 3).map(v => v.toFixed(4)));
  console.log('  join works:', typeof single.join === 'function');

  const batch = await p.embedBatch(['hello world', 'Brightwell Capital']);
  console.log('embedBatch() - Length:', batch.length);
  console.log('  [0] Length:', batch[0]?.length, 'First3:', batch[0]?.slice(0, 3).map(v => v.toFixed(4)));

  // Test cosine similarity
  const q = await p.embed('Where does the user work?');
  const a1 = await p.embed('User works at Brightwell Capital');
  const a2 = await p.embed('User loves eating pizza');
  console.log('\nCosine similarity test:');
  console.log('  "Where does user work?" vs "User works at Brightwell Capital":', cosine(q, a1).toFixed(4));
  console.log('  "Where does user work?" vs "User loves eating pizza":', cosine(q, a2).toFixed(4));
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

main().catch(console.error);

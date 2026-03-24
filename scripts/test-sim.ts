import { PerplexityEmbeddingAdapter } from '../packages/engine/src/adapters/perplexity-embedding.js';
import { config } from 'dotenv';
config({ path: '.env' });

const p = new PerplexityEmbeddingAdapter({ apiKey: process.env.PERPLEXITY_API_KEY!, dimensions: 2000 });

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function main() {
  const queries = [
    "What is Caroline's identity?",
    "What did Caroline research?",
    "When did Caroline go to the LGBTQ support group?",
  ];

  const facts = [
    "User is going to a transgender conference in July 2023.",
    "User is a transgender woman.",
    "User is researching adoption agencies on 25 May 2023",
    "User attended a council meeting about adoption on 14 July 2023.",
    "User attended an LGBTQ support group on 8 May 2023.",
    "User went to a LGBTQ support group yesterday",
  ];

  const all = await p.embedBatch([...queries, ...facts]);

  for (let qi = 0; qi < queries.length; qi++) {
    console.log(`\nQuery: "${queries[qi]}"`);
    for (let fi = 0; fi < facts.length; fi++) {
      const sim = cosine(all[qi]!, all[queries.length + fi]!);
      console.log(`  ${sim.toFixed(4)} | ${facts[fi]}`);
    }
  }
}
main().catch(console.error);

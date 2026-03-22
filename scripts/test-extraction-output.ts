import { OpenAILLMAdapter } from '../packages/openai-adapter/src/index.js';
import { buildExtractionPrompt } from '../packages/engine/src/extraction/prompts.js';
import { config } from 'dotenv';
config({ path: '.env' });

async function main() {
  const llm = new OpenAILLMAdapter({ apiKey: process.env.OPENAI_API_KEY!, model: 'gpt-4.1-nano' });

  const messages = buildExtractionPrompt("I shop at Target pretty frequently, maybe every other week. I like buying household items, toiletries, and sometimes kids' clothes. I've been using the Cartwheel app from Target and it's been great for saving money.");

  const response = await llm.complete(messages, { temperature: 0, responseFormat: 'json' });

  console.log('RAW LLM OUTPUT:');
  console.log(response.content);

  const parsed = JSON.parse(response.content);
  console.log('\nFacts:', parsed.facts?.length ?? 0);
  console.log('Entities:', parsed.entities?.length ?? 0);
  console.log('Edges:', parsed.edges?.length ?? 0);

  if (parsed.edges) {
    console.log('\nEdges detail:');
    for (const e of parsed.edges) console.log(`  ${JSON.stringify(e)}`);
  } else {
    console.log('\n⚠️ NO EDGES KEY IN RESPONSE');
  }
}
main().catch(console.error);

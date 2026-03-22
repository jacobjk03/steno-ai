#!/usr/bin/env node
import { createStenoServer } from './server.js';
import { checkProvider } from '@steno-ai/openai-compat-adapter';
import type { StenoLocalConfig } from './config.js';
import { OLLAMA_PRESET, LM_STUDIO_PRESET } from './config.js';

const args = process.argv.slice(2);
const command = args[0];

function getArg(name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : undefined;
}

function parseConfig(): StenoLocalConfig {
  const preset = getArg('--preset');
  const base = preset === 'ollama' ? OLLAMA_PRESET :
               preset === 'lm-studio' ? LM_STUDIO_PRESET : {};

  return {
    dbPath: getArg('--db') ?? './steno.db',
    llm: {
      baseUrl: getArg('--llm-url') ?? base.llm?.baseUrl ?? 'http://localhost:11434/v1',
      model: getArg('--llm-model') ?? base.llm?.model ?? 'mistral',
    },
    embedding: {
      baseUrl: getArg('--embedding-url') ?? base.embedding?.baseUrl ?? 'http://localhost:11434/v1',
      model: getArg('--embedding-model') ?? base.embedding?.model ?? 'nomic-embed-text',
      dimensions: parseInt(getArg('--embedding-dim') ?? String(base.embedding?.dimensions ?? 768), 10),
    },
  };
}

async function main(): Promise<void> {
  switch (command) {
    case 'serve': {
      const config = parseConfig();
      const port = parseInt(getArg('--port') ?? '7540', 10);
      const server = createStenoServer({ ...config, port });
      server.start();
      break;
    }
    case 'doctor': {
      const config = parseConfig();
      console.log('Steno Doctor\n');
      // Check LLM
      const llmStatus = await checkProvider(config.llm.baseUrl);
      if (llmStatus.available) {
        console.log(`LLM provider at ${config.llm.baseUrl} - available`);
        if (llmStatus.models.length > 0) {
          const hasModel = llmStatus.models.includes(config.llm.model);
          console.log(hasModel
            ? `Model '${config.llm.model}' available`
            : `Model '${config.llm.model}' not found. Available: ${llmStatus.models.join(', ')}`);
        }
      } else {
        console.log(`LLM provider not available at ${config.llm.baseUrl}: ${llmStatus.error}`);
      }
      // Check embedding
      const embStatus = await checkProvider(config.embedding.baseUrl);
      console.log(embStatus.available
        ? `Embedding provider at ${config.embedding.baseUrl} - available`
        : `Embedding provider not available at ${config.embedding.baseUrl}: ${embStatus.error}`);
      break;
    }
    default:
      console.log('Usage: steno <command> [options]\n\nCommands:\n  serve     Start local server\n  doctor    Check dependencies\n\nOptions:\n  --preset <ollama|lm-studio>  Use preset config\n  --db <path>                  Database path (default: ./steno.db)\n  --port <port>                Server port (default: 7540)\n  --llm-url <url>              LLM base URL\n  --llm-model <model>          LLM model name\n  --embedding-url <url>        Embedding base URL\n  --embedding-model <model>    Embedding model name\n  --embedding-dim <dim>        Embedding dimensions (default: 768)\n');
  }
}

main().catch(console.error);

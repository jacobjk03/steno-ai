# @steno-ai/local

Zero-config local Steno setup. Runs entirely on your machine with SQLite storage and any OpenAI-compatible LLM (Ollama, LM Studio, etc.).

## Install

```bash
npm install @steno-ai/local
```

## Usage

```ts
import { createStenoLocal, OLLAMA_PRESET } from '@steno-ai/local';

const steno = await createStenoLocal({
  ...OLLAMA_PRESET,
  dbPath: './steno.db',
});

// Add memories
await steno.memory.add({
  scope: 'user',
  scopeId: 'user_123',
  data: 'I love hiking and live in Portland',
});

// Search
const results = await steno.memory.search({
  query: 'hobbies',
  scope: 'user',
  scopeId: 'user_123',
});

// Sessions, triggers, graph, feedback -- all available
steno.close();
```

## Presets

- `OLLAMA_PRESET` -- Ollama with default models
- `LM_STUDIO_PRESET` -- LM Studio with default models

## CLI

```bash
npx @steno-ai/local
```

## Part of [Steno](https://github.com/SankrityaT/steno-ai)

The memory layer for AI agents.

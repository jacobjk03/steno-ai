# @steno-ai/openai-adapter

OpenAI LLM and embedding adapter for Steno. Uses the official OpenAI SDK.

## Install

```bash
npm install @steno-ai/openai-adapter
```

## Usage

```ts
import { OpenAILLMAdapter, OpenAIEmbeddingAdapter } from '@steno-ai/openai-adapter';

const llm = new OpenAILLMAdapter({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4.1-nano',      // default
});

const embedding = new OpenAIEmbeddingAdapter({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'text-embedding-3-small', // default
  dimensions: 1536,                 // default
});

// Use with @steno-ai/engine
const result = await runExtractionPipeline({
  storage,
  embedding,
  cheapLLM: llm,
  embeddingModel: 'text-embedding-3-small',
  embeddingDim: 1536,
}, input);
```

## Part of [Steno](https://github.com/SankrityaT/steno-ai)

The memory layer for AI agents.

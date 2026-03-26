# @steno-ai/openai-compat-adapter

OpenAI-compatible LLM and embedding adapter for Steno. Works with any provider that implements the OpenAI chat/completions API (Ollama, LM Studio, Together, Groq, etc.).

## Install

```bash
npm install @steno-ai/openai-compat-adapter
```

## Usage

```ts
import {
  OpenAICompatLLMAdapter,
  OpenAICompatEmbeddingAdapter,
} from '@steno-ai/openai-compat-adapter';

// Ollama
const llm = new OpenAICompatLLMAdapter({
  baseUrl: 'http://localhost:11434/v1',
  model: 'llama3.2',
});

// Together AI
const embedding = new OpenAICompatEmbeddingAdapter({
  baseUrl: 'https://api.together.xyz/v1',
  model: 'togethercomputer/m2-bert-80M-8k-retrieval',
  apiKey: process.env.TOGETHER_API_KEY,
  dimensions: 768,
});
```

## Constructor Options

```ts
{
  baseUrl: string;       // Provider API base URL
  model: string;         // Model name
  apiKey?: string;       // API key (optional for local providers)
  timeout?: number;      // Request timeout in ms (default: 60000)
}
```

## Part of [Steno](https://github.com/SankrityaT/steno-ai)

The memory layer for AI agents.

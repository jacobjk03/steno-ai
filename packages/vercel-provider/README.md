# @steno-ai/vercel-provider

Vercel AI SDK middleware that adds automatic memory to any language model. Memories are searched before each call and conversations are stored after.

## Install

```bash
npm install @steno-ai/vercel-provider @steno-ai/sdk
```

## Usage

```ts
import { stenoMemory } from '@steno-ai/vercel-provider';
import { wrapLanguageModel, generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const model = wrapLanguageModel({
  model: openai('gpt-4o'),
  middleware: stenoMemory({
    apiKey: 'sk_steno_...',
    userId: 'user_123',
    maxMemories: 5,     // default
    autoStore: true,     // default
  }),
});

const { text } = await generateText({
  model,
  prompt: 'What do you remember about me?',
});
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `apiKey` | -- | Steno API key |
| `userId` | -- | User ID to scope memories to |
| `maxMemories` | `5` | Max memories injected into context |
| `autoStore` | `true` | Auto-store conversations after generation |
| `baseUrl` | `https://api.steno.ai` | Custom API base URL |

## Part of [Steno](https://github.com/SankrityaT/steno-ai)

The memory layer for AI agents.

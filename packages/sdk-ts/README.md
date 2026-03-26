# @steno-ai/sdk

TypeScript SDK for the Steno API. Dead-simple memory for your AI apps.

## Install

```bash
npm install @steno-ai/sdk
```

## Usage

```ts
import Steno from '@steno-ai/sdk';

const steno = new Steno('sk_steno_...');

// Add a memory (string or message array)
await steno.add('user_123', 'I love pizza and I work at Google');
await steno.add('user_123', [
  { role: 'user', content: 'I just moved to SF' },
  { role: 'assistant', content: 'Welcome to San Francisco!' },
]);

// Search memories
const results = await steno.search('user_123', 'food preferences');
for (const r of results.results) {
  console.log(r.content, r.score);
}

// Feedback
await steno.feedback('fact_id', true);
```

## Sub-clients

For power users, the SDK exposes sub-clients:

```ts
steno.memory    // Full memory CRUD
steno.sessions  // Session management
steno.triggers  // Memory triggers
steno.keys      // API key management
steno.graph     // Knowledge graph API
steno.webhooks  // Webhook management
```

## Part of [Steno](https://github.com/SankrityaT/steno-ai)

The memory layer for AI agents.

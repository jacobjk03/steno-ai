---
name: steno-memory
description: Persistent memory for your coding agent powered by Steno
version: 0.1.0
author: Steno AI
tools:
  - name: steno_remember
    description: Remember information for future sessions
    parameters:
      content:
        type: string
        required: true
        description: What to remember
  - name: steno_recall
    description: Recall relevant memories
    parameters:
      query:
        type: string
        required: true
        description: What to recall
  - name: steno_feedback
    description: Rate a memory's usefulness
    parameters:
      fact_id:
        type: string
        required: true
      useful:
        type: boolean
        required: true
---

# Steno Memory for OpenClaw

Give your OpenClaw agent persistent memory that survives across sessions.

## Setup

```bash
export STENO_API_KEY=sk_steno_...
```

## Usage

The agent can use these tools:

- **steno_remember** — Store information for later
- **steno_recall** — Search for relevant memories
- **steno_feedback** — Rate if a memory was helpful

## Examples

"Remember that this project uses TypeScript with strict mode"
"What do I know about the user's testing preferences?"
"That memory about React was helpful" → feedback positive

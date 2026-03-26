# @steno-ai/cache-adapter

In-memory cache adapter for Steno. Implements the `CacheAdapter` interface with TTL support.

## Install

```bash
npm install @steno-ai/cache-adapter
```

## Usage

```ts
import { InMemoryCacheAdapter } from '@steno-ai/cache-adapter';

const cache = new InMemoryCacheAdapter();

await cache.set('key', { some: 'value' }, 300); // TTL: 300 seconds
const val = await cache.get('key');              // { some: 'value' }
await cache.del('key');
await cache.incr('counter');                     // atomic increment
await cache.expire('counter', 60);               // set TTL on existing key
```

## API

| Method | Description |
|--------|-------------|
| `get<T>(key)` | Get a value (returns `null` if missing or expired) |
| `set<T>(key, value, ttlSeconds?)` | Set a value with optional TTL |
| `del(key)` | Delete a key |
| `incr(key)` | Atomic increment (starts at 0) |
| `expire(key, ttlSeconds)` | Set TTL on an existing key |
| `ping()` | Always returns `true` |

## Part of [Steno](https://github.com/SankrityaT/steno-ai)

The memory layer for AI agents.

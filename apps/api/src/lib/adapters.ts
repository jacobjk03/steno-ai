import type { Env } from '../env.js';
import { createSupabaseClient, SupabaseStorageAdapter } from '@steno-ai/supabase-adapter';
import { OpenAILLMAdapter, OpenAIEmbeddingAdapter } from '@steno-ai/openai-adapter';
import { InMemoryCacheAdapter } from '@steno-ai/cache-adapter';
import type { StorageAdapter, EmbeddingAdapter, LLMAdapter, CacheAdapter } from '@steno-ai/engine';

export interface Adapters {
  storage: StorageAdapter;
  embedding: EmbeddingAdapter;
  cheapLLM: LLMAdapter;
  smartLLM: LLMAdapter;
  cache: CacheAdapter;
}

export function createAdapters(env: Env): Adapters {
  const supabase = createSupabaseClient({
    url: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  });

  return {
    storage: new SupabaseStorageAdapter(supabase),
    embedding: new OpenAIEmbeddingAdapter({
      apiKey: env.OPENAI_API_KEY,
      model: env.EMBEDDING_MODEL,
      dimensions: env.EMBEDDING_DIM ? parseInt(env.EMBEDDING_DIM, 10) : undefined,
    }),
    cheapLLM: new OpenAILLMAdapter({
      apiKey: env.OPENAI_API_KEY,
      model: env.CHEAP_LLM_MODEL ?? 'gpt-4.1-nano',
    }),
    smartLLM: new OpenAILLMAdapter({
      apiKey: env.OPENAI_API_KEY,
      model: env.SMART_LLM_MODEL ?? 'gpt-4o',
    }),
    cache: new InMemoryCacheAdapter(), // TODO: Replace with UpstashCacheAdapter when ready
  };
}

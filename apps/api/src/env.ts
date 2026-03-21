export interface Env {
  // Supabase
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;

  // OpenAI
  OPENAI_API_KEY: string;

  // Upstash Redis
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;

  // Cloudflare Queues
  EXTRACTION_QUEUE: Queue;
  WEBHOOK_QUEUE: Queue;

  // Optional config overrides
  EMBEDDING_MODEL?: string;        // default: text-embedding-3-small
  EMBEDDING_DIM?: string;          // default: 1536
  CHEAP_LLM_MODEL?: string;        // default: gpt-4.1-nano
  SMART_LLM_MODEL?: string;        // default: gpt-4o

  // Environment
  ENVIRONMENT?: string;
}

import Steno from '@steno-ai/sdk';
import type { LanguageModelV1Middleware } from 'ai';

export interface StenoProviderOptions {
  /** Steno API key (sk_steno_...) */
  apiKey: string;
  /** User ID to scope memories to */
  userId: string;
  /** Custom Steno API base URL */
  baseUrl?: string;
  /** Maximum number of memories to inject (default: 5) */
  maxMemories?: number;
  /** Whether to store conversations after generation (default: true) */
  autoStore?: boolean;
}

/**
 * Extract plain text from the last user message in a LanguageModelV1Prompt.
 *
 * User message content is always `Array<TextPart | ImagePart | FilePart>` in
 * the V1 spec, so we pull out text parts and join them.
 */
function extractLastUserText(
  prompt: Parameters<
    NonNullable<LanguageModelV1Middleware['transformParams']>
  >[0]['params']['prompt'],
): string {
  const lastUser = [...prompt].reverse().find((m) => m.role === 'user');
  if (!lastUser || lastUser.role !== 'user') return '';

  return lastUser.content
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join(' ')
    .trim();
}

/**
 * Build a plain-text summary of the conversation for storage.
 */
function conversationToMessages(
  prompt: Parameters<
    NonNullable<LanguageModelV1Middleware['transformParams']>
  >[0]['params']['prompt'],
): Array<{ role: string; content: string }> {
  const out: Array<{ role: string; content: string }> = [];

  for (const msg of prompt) {
    if (msg.role === 'system') {
      // Skip system messages — don't store injected memories back
      continue;
    }

    if (msg.role === 'user') {
      const text = msg.content
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join(' ')
        .trim();
      if (text) out.push({ role: 'user', content: text });
    }

    if (msg.role === 'assistant') {
      const text = msg.content
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join(' ')
        .trim();
      if (text) out.push({ role: 'assistant', content: text });
    }
  }

  return out;
}

/**
 * Creates Steno memory middleware for the Vercel AI SDK.
 *
 * Wraps any language model to automatically:
 * 1. Search for relevant memories before each LLM call
 * 2. Inject those memories into the system prompt
 * 3. Store the conversation after generation (when autoStore is true)
 *
 * @example
 * ```ts
 * import { wrapLanguageModel } from 'ai';
 * import { stenoMemory } from '@steno-ai/vercel-provider';
 *
 * const model = wrapLanguageModel({
 *   model: anthropic('claude-sonnet-4.6'),
 *   middleware: stenoMemory({ apiKey: 'sk_steno_...', userId: 'user_123' }),
 * });
 * ```
 */
export function stenoMemory(
  options: StenoProviderOptions,
): LanguageModelV1Middleware {
  const steno = new Steno(options.apiKey, { baseUrl: options.baseUrl });
  const maxMemories = options.maxMemories ?? 5;
  const autoStore = options.autoStore ?? true;

  const middleware: LanguageModelV1Middleware = {
    middlewareVersion: 'v1',

    transformParams: async ({ params }) => {
      const queryText = extractLastUserText(params.prompt);
      if (!queryText) return params;

      try {
        // Fetch user profile + relevant memories in parallel
        // TODO: Replace raw HTTP call with steno.profile() once SDK supports it
        const [profileResult, searchResult] = await Promise.allSettled([
          // Wrap in Promise.resolve().then() so synchronous access errors
          // (e.g. missing .memory.http) become rejections, not thrown exceptions
          Promise.resolve().then(
            () =>
              (steno as any).memory.http.request(
                'GET',
                `/v1/profile/${encodeURIComponent(options.userId)}`,
              ) as Promise<{
                static?: Array<{ category?: string; content: string }>;
                dynamic?: Array<{ content: string }>;
              }>,
          ),
          steno.search(options.userId, queryText, maxMemories),
        ]);

        const contextParts: string[] = [];

        // Add profile if available
        if (profileResult.status === 'fulfilled' && profileResult.value) {
          const profile = profileResult.value;
          const staticFacts = (profile.static || [])
            .map((f) => f.content)
            .join('\n  - ');
          if (staticFacts) {
            contextParts.push(`User profile:\n  - ${staticFacts}`);
          }
        }

        // Add relevant memories
        if (searchResult.status === 'fulfilled') {
          const memories = searchResult.value.results || [];
          if (memories.length > 0) {
            const memoryText = memories
              .map((r) => r.content)
              .join('\n  - ');
            contextParts.push(`Relevant memories:\n  - ${memoryText}`);
          }
        }

        if (contextParts.length > 0) {
          const memoryMessage: (typeof params.prompt)[number] = {
            role: 'system' as const,
            content: `You have the following context about this user:\n\n${contextParts.join('\n\n')}\n\nUse this context to personalize your response when relevant.`,
          };

          return {
            ...params,
            prompt: [memoryMessage, ...params.prompt],
          };
        }
      } catch {
        // If memory/profile fetch fails, continue without context — don't break the app
      }

      return params;
    },
  };

  if (autoStore) {
    middleware.wrapGenerate = async ({ doGenerate, params }) => {
      const result = await doGenerate();

      // Store the conversation asynchronously — don't block the response
      try {
        const messages = conversationToMessages(params.prompt);

        // Also include the assistant's generated response
        const generatedText = result.text;
        if (generatedText) {
          messages.push({ role: 'assistant', content: generatedText });
        }

        if (messages.length > 0) {
          void steno.add(options.userId, messages).catch(() => {});
        }
      } catch {
        // Silent failure — never break the app for storage
      }

      return result;
    };
  }

  return middleware;
}

export { stenoMemory as default };

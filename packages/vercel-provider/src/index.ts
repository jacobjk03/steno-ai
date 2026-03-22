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
        const response = await steno.search(
          options.userId,
          queryText,
          maxMemories,
        );

        if (response.results && response.results.length > 0) {
          const memoryContext = response.results
            .map((r) => `- ${r.content}`)
            .join('\n');

          const memoryMessage: (typeof params.prompt)[number] = {
            role: 'system' as const,
            content: `You have the following memories about this user:\n${memoryContext}\n\nUse these memories to personalize your response when relevant.`,
          };

          return {
            ...params,
            prompt: [memoryMessage, ...params.prompt],
          };
        }
      } catch {
        // If memory search fails, continue without memories — don't break the app
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

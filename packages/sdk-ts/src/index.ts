import { HttpClient } from './http.js';
import { MemoryClient } from './clients/memory.js';
import { SessionClient } from './clients/sessions.js';
import { TriggerClient } from './clients/triggers.js';
import { KeyClient } from './clients/keys.js';
import type { Message, SearchResponse, UsageResponse } from './types.js';

export { StenoError } from './errors.js';
export { MemoryClient } from './clients/memory.js';
export { SessionClient } from './clients/sessions.js';
export { TriggerClient } from './clients/triggers.js';
export { KeyClient } from './clients/keys.js';
export type * from './types.js';

/**
 * Steno AI SDK — dead-simple memory for your AI apps.
 *
 * ```ts
 * const steno = new Steno('sk_steno_...');
 * await steno.add('user_123', 'I love pizza and I work at Google');
 * const memories = await steno.search('user_123', 'food preferences');
 * ```
 */
export default class Steno {
  /** Full memory API for power users. */
  readonly memory: MemoryClient;
  /** Session management. */
  readonly sessions: SessionClient;
  /** Memory triggers. */
  readonly triggers: TriggerClient;
  /** API key management. */
  readonly keys: KeyClient;

  constructor(apiKey: string, options?: { baseUrl?: string }) {
    if (!apiKey) throw new Error('Steno API key is required');

    const baseUrl = options?.baseUrl ?? 'https://api.steno.ai';
    const http = new HttpClient(apiKey, baseUrl);

    this.memory = new MemoryClient(http);
    this.sessions = new SessionClient(http);
    this.triggers = new TriggerClient(http);
    this.keys = new KeyClient(http);
  }

  // ── Shorthand one-liners ──

  /**
   * Add a memory — the simplest way.
   *
   * ```ts
   * await steno.add('user_123', 'I love pizza');
   * await steno.add('user_123', [
   *   { role: 'user', content: 'I love pizza' },
   *   { role: 'assistant', content: 'Got it!' },
   * ]);
   * ```
   */
  async add(
    userId: string,
    content: string | Message[],
  ): Promise<{ extractionId: string }> {
    if (typeof content === 'string') {
      return this.memory.add({
        scope: 'user',
        scopeId: userId,
        inputType: 'raw_text',
        data: content,
      });
    }
    return this.memory.add({
      scope: 'user',
      scopeId: userId,
      inputType: 'conversation',
      messages: content,
    });
  }

  /**
   * Search memories — one line.
   *
   * ```ts
   * const results = await steno.search('user_123', 'food preferences');
   * ```
   */
  async search(
    userId: string,
    query: string,
    limit?: number,
  ): Promise<SearchResponse> {
    return this.memory.search({
      query,
      scope: 'user',
      scopeId: userId,
      limit,
    });
  }

  /**
   * Give feedback on a memory — thumbs up or down.
   *
   * ```ts
   * await steno.feedback('fact_id', true);   // useful
   * await steno.feedback('fact_id', false);  // not useful
   * ```
   */
  async feedback(factId: string, useful: boolean): Promise<void> {
    return this.memory.feedback({
      factId,
      wasUseful: useful,
      feedbackType: useful ? 'explicit_positive' : 'explicit_negative',
    });
  }

  /** Get usage stats for the current API key. */
  async usage(): Promise<UsageResponse> {
    return this.keys.usage();
  }
}

import type { LLMAdapter, LLMMessage, LLMResponse } from '@steno-ai/engine';

export class OpenAICompatLLMAdapter implements LLMAdapter {
  readonly model: string;
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;

  constructor(config: {
    baseUrl: string;
    model: string;
    apiKey?: string;
    timeout?: number;
  }) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.model = config.model;
    this.apiKey = config.apiKey ?? '';
    this.timeout = config.timeout ?? 60000;
  }

  async complete(messages: LLMMessage[], options?: {
    temperature?: number;
    maxTokens?: number;
    responseFormat?: 'json';
  }): Promise<LLMResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const body: Record<string, unknown> = {
        model: this.model,
        messages,
        temperature: options?.temperature ?? 0,
        stream: false,
      };

      if (options?.maxTokens) body.max_tokens = options.maxTokens;
      if (options?.responseFormat === 'json') {
        body.response_format = { type: 'json_object' };
      }

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`LLM provider error (${response.status}): ${errorText}`);
      }

      const data = await response.json() as {
        choices: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        model?: string;
      };

      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('LLM provider returned empty response');

      return {
        content,
        tokensInput: data.usage?.prompt_tokens ?? 0,
        tokensOutput: data.usage?.completion_tokens ?? 0,
        model: data.model ?? this.model,
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`LLM provider timed out after ${this.timeout}ms at ${this.baseUrl}`);
      }
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error(`LLM provider not available at ${this.baseUrl}. Ensure your model server is running.`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

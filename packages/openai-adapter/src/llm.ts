import OpenAI from 'openai';
import type { LLMAdapter, LLMMessage, LLMResponse } from '@steno-ai/engine';

export class OpenAILLMAdapter implements LLMAdapter {
  private client: OpenAI;
  readonly model: string;

  constructor(config: { apiKey: string; model?: string; _client?: OpenAI }) {
    this.client = config._client ?? new OpenAI({ apiKey: config.apiKey });
    this.model = config.model ?? 'gpt-4.1-nano';
  }

  async complete(
    messages: LLMMessage[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      responseFormat?: 'json';
    },
  ): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: options?.temperature ?? 0,
      max_tokens: options?.maxTokens,
      ...(options?.responseFormat === 'json'
        ? { response_format: { type: 'json_object' as const } }
        : {}),
    });

    const choice = response.choices[0];
    if (!choice?.message?.content) {
      throw new Error('OpenAI returned empty response');
    }

    return {
      content: choice.message.content,
      tokensInput: response.usage?.prompt_tokens ?? 0,
      tokensOutput: response.usage?.completion_tokens ?? 0,
      model: response.model,
    };
  }
}

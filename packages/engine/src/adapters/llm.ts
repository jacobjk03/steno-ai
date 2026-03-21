export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  tokensInput: number;
  tokensOutput: number;
  model: string;
}

export interface LLMAdapter {
  complete(messages: LLMMessage[], options?: { temperature?: number; maxTokens?: number; responseFormat?: 'json' }): Promise<LLMResponse>;
  readonly model: string;
}

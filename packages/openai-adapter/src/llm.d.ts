import OpenAI from 'openai';
import type { LLMAdapter, LLMMessage, LLMResponse } from '@steno-ai/engine';
export declare class OpenAILLMAdapter implements LLMAdapter {
    private client;
    readonly model: string;
    constructor(config: {
        apiKey: string;
        model?: string;
        _client?: OpenAI;
    });
    complete(messages: LLMMessage[], options?: {
        temperature?: number;
        maxTokens?: number;
        responseFormat?: 'json';
    }): Promise<LLMResponse>;
}
//# sourceMappingURL=llm.d.ts.map
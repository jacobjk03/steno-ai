import OpenAI from 'openai';
import type { EmbeddingAdapter } from '@steno-ai/engine';
export declare class OpenAIEmbeddingAdapter implements EmbeddingAdapter {
    private client;
    readonly model: string;
    readonly dimensions: number;
    constructor(config: {
        apiKey: string;
        model?: string;
        dimensions?: number;
        _client?: OpenAI;
    });
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
}
//# sourceMappingURL=embedding.d.ts.map
import OpenAI from 'openai';
import type { EmbeddingAdapter } from '@steno-ai/engine';

export class OpenAIEmbeddingAdapter implements EmbeddingAdapter {
  private client: OpenAI;
  readonly model: string;
  readonly dimensions: number;

  constructor(config: { apiKey: string; model?: string; dimensions?: number; _client?: OpenAI }) {
    this.client = config._client ?? new OpenAI({ apiKey: config.apiKey });
    this.model = config.model ?? 'text-embedding-3-small';
    this.dimensions = config.dimensions ?? 1536;
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
      dimensions: this.dimensions,
    });
    const item = response.data[0];
    if (!item) throw new Error('OpenAI returned empty embedding response');
    return item.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts,
      dimensions: this.dimensions,
    });
    return response.data.map((d) => d.embedding);
  }
}

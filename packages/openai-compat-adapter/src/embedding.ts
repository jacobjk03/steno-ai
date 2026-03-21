import type { EmbeddingAdapter } from '@steno-ai/engine';

export class OpenAICompatEmbeddingAdapter implements EmbeddingAdapter {
  readonly model: string;
  readonly dimensions: number;
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;

  constructor(config: {
    baseUrl: string;
    model: string;
    dimensions?: number;
    apiKey?: string;
    timeout?: number;
  }) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.model = config.model;
    this.dimensions = config.dimensions ?? 768;
    this.apiKey = config.apiKey ?? '';
    this.timeout = config.timeout ?? 30000;
  }

  async embed(text: string): Promise<number[]> {
    const result = await this.callEmbedding(text);
    return result[0] ?? [];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    return this.callEmbedding(texts);
  }

  private async callEmbedding(input: string | string[]): Promise<number[][]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.model,
          input,
          ...(this.dimensions ? { dimensions: this.dimensions } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Embedding provider error (${response.status}): ${errorText}`);
      }

      const data = await response.json() as {
        data: Array<{ embedding: number[] }>;
      };

      if (!data.data || data.data.length === 0) {
        throw new Error('Embedding provider returned empty response');
      }

      return data.data.map(d => d.embedding);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Embedding provider timed out after ${this.timeout}ms at ${this.baseUrl}`);
      }
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error(`Embedding provider not available at ${this.baseUrl}. Ensure your model server is running.`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

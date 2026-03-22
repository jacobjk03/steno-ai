import type { EmbeddingAdapter } from './embedding.js';

/**
 * Gemini Embedding Adapter — uses Google's free gemini-embedding-001 model.
 * SOTA retrieval quality (67.71% MTEB) vs text-embedding-3-small (62.3%).
 */
export class GeminiEmbeddingAdapter implements EmbeddingAdapter {
  readonly model: string;
  readonly dimensions: number;
  private apiKey: string;
  private baseUrl: string;

  constructor(config: { apiKey: string; model?: string }) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'gemini-embedding-001';
    this.dimensions = 3072; // gemini-embedding-001 outputs 3072
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch(
      `${this.baseUrl}/models/${this.model}:embedContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${this.model}`,
          content: { parts: [{ text }] },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini embedding error (${response.status}): ${err}`);
    }

    const data = await response.json() as { embedding: { values: number[] } };
    return data.embedding.values;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await fetch(
      `${this.baseUrl}/models/${this.model}:batchEmbedContents?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: texts.map(text => ({
            model: `models/${this.model}`,
            content: { parts: [{ text }] },
          })),
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini batch embedding error (${response.status}): ${err}`);
    }

    const data = await response.json() as { embeddings: Array<{ values: number[] }> };
    return data.embeddings.map(e => e.values);
  }
}

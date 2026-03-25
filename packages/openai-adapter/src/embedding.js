import OpenAI from 'openai';
export class OpenAIEmbeddingAdapter {
    client;
    model;
    dimensions;
    constructor(config) {
        this.client = config._client ?? new OpenAI({ apiKey: config.apiKey });
        this.model = config.model ?? 'text-embedding-3-small';
        this.dimensions = config.dimensions ?? 1536;
    }
    async embed(text) {
        const response = await this.client.embeddings.create({
            model: this.model,
            input: text,
            dimensions: this.dimensions,
        });
        const item = response.data[0];
        if (!item)
            throw new Error('OpenAI returned empty embedding response');
        return item.embedding;
    }
    async embedBatch(texts) {
        if (texts.length === 0)
            return [];
        const response = await this.client.embeddings.create({
            model: this.model,
            input: texts,
            dimensions: this.dimensions,
        });
        return response.data.map((d) => d.embedding);
    }
}
//# sourceMappingURL=embedding.js.map
export interface EmbeddingAdapter {
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
    readonly model: string;
    readonly dimensions: number;
}
//# sourceMappingURL=embedding.d.ts.map
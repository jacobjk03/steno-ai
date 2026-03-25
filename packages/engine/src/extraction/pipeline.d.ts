import type { StorageAdapter } from '../adapters/storage.js';
import type { EmbeddingAdapter } from '../adapters/embedding.js';
import type { LLMAdapter } from '../adapters/llm.js';
import type { ExtractionInput, PipelineResult, ExtractedFact, ExtractedEntity } from './types.js';
export interface PipelineConfig {
    storage: StorageAdapter;
    embedding: EmbeddingAdapter;
    cheapLLM: LLMAdapter;
    smartLLM?: LLMAdapter;
    extractionTier?: 'heuristic_only' | 'cheap_only' | 'auto' | 'smart_only';
    embeddingModel: string;
    embeddingDim: number;
    decayHalfLifeDays?: number;
    decayNormalizationK?: number;
}
export declare function inputToText(input: ExtractionInput): string;
export declare function mergeFacts(heuristic: ExtractedFact[], llm: ExtractedFact[]): ExtractedFact[];
export declare function mergeEntities(heuristic: ExtractedEntity[], llm: ExtractedEntity[]): ExtractedEntity[];
export declare function runExtractionPipeline(config: PipelineConfig, input: ExtractionInput): Promise<PipelineResult>;
/**
 * Run extraction for a pre-created extraction record (from queue).
 * Unlike runExtractionPipeline, this does NOT create the extraction record
 * or perform hash-based dedup — both were already handled by the API route.
 * It updates the existing record through the pipeline lifecycle.
 */
export declare function runExtractionFromQueue(config: PipelineConfig, extractionId: string, input: ExtractionInput): Promise<PipelineResult>;
//# sourceMappingURL=pipeline.d.ts.map
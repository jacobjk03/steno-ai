import type { LLMAdapter } from '../adapters/llm.js';
import type { ExtractionResult } from './types.js';
import type { ExtractionTier } from '../config.js';
export interface LLMExtractorConfig {
    llm: LLMAdapter;
    tier: ExtractionTier;
}
/**
 * Two-pass extraction like Mem0:
 * Pass 1: Extract facts as simple strings (focused, high quality)
 * Pass 2: Extract entities + edges from the facts (separate concern)
 */
export declare function extractWithLLM(config: LLMExtractorConfig, input: string, existingFacts?: Array<{
    lineageId: string;
    content: string;
}>): Promise<ExtractionResult>;
/**
 * Normalize an entity name to a clean canonical form.
 */
export declare function normalizeEntityName(raw: string): string;
//# sourceMappingURL=llm-extractor.d.ts.map
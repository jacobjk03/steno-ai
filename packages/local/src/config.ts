export interface StenoLocalConfig {
  dbPath: string;
  llm: { baseUrl: string; model: string; apiKey?: string; timeout?: number };
  smartLLM?: { baseUrl: string; model: string; apiKey?: string; timeout?: number };
  embedding: { baseUrl: string; model: string; dimensions?: number; apiKey?: string; timeout?: number };
  extractionTier?: 'heuristic_only' | 'cheap_only' | 'auto' | 'smart_only';
  decayHalfLifeDays?: number;
  decayNormalizationK?: number;
}

export const OLLAMA_PRESET: Partial<StenoLocalConfig> = {
  llm: { baseUrl: 'http://localhost:11434/v1', model: 'mistral' },
  embedding: { baseUrl: 'http://localhost:11434/v1', model: 'nomic-embed-text', dimensions: 768 },
};

export const LM_STUDIO_PRESET: Partial<StenoLocalConfig> = {
  llm: { baseUrl: 'http://localhost:1234/v1', model: 'local-model' },
  embedding: { baseUrl: 'http://localhost:1234/v1', model: 'local-model', dimensions: 768 },
};

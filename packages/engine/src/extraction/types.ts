import type { Scope, SourceType, ExtractionTier, Modality, EdgeType } from '../config.js';

/** What a single extraction stage produces */
export interface ExtractionResult {
  facts: ExtractedFact[];
  entities: ExtractedEntity[];
  edges: ExtractedEdge[];
  tier: ExtractionTier;
  confidence: number;
  tokensInput: number;
  tokensOutput: number;
  model: string | null; // null for heuristic tier
}

export interface ExtractedFact {
  content: string;
  importance: number; // 0-1
  confidence: number; // 0-1
  sourceType: SourceType;
  modality: Modality;
  tags: string[];
  originalContent: string;
  operation?: 'add' | 'update' | 'invalidate' | 'noop' | 'contradict';
  existingLineageId?: string;
  contradictsFactId?: string;
  /** Canonical names of entities mentioned in THIS fact (for precise fact-entity linking) */
  entityCanonicalNames?: string[];
}

export interface ExtractedEntity {
  name: string;
  entityType: string;
  canonicalName: string; // lowercased, normalized
  properties: Record<string, unknown>;
}

export interface ExtractedEdge {
  sourceName: string; // canonical name
  targetName: string; // canonical name
  relation: string;
  edgeType: EdgeType;
  confidence: number;
}

/** Input to the extraction pipeline */
export interface ExtractionInput {
  tenantId: string;
  scope: Scope;
  scopeId: string;
  sessionId?: string;
  inputType: 'conversation' | 'document' | 'url' | 'raw_text' | 'image' | 'audio' | 'code';
  data: unknown;
  existingFacts?: Array<{ id: string; lineageId: string; content: string; embedding?: number[] }>;
}

/** Final output of the full pipeline */
export interface PipelineResult {
  extractionId: string;
  factsCreated: number;
  factsUpdated: number;
  factsInvalidated: number;
  entitiesCreated: number;
  edgesCreated: number;
  tier: ExtractionTier | 'multi_tier';
  costTokensInput: number;
  costTokensOutput: number;
  durationMs: number;
}

// ── Common ──

export type Scope = 'user' | 'org' | 'project' | 'global';

export interface Message {
  role: string;
  content: string;
}

// ── Memory ──

export interface AddMemoryParams {
  scope: Scope;
  scopeId: string;
  inputType?: 'raw_text' | 'conversation';
  data?: string;
  messages?: Message[];
  sessionId?: string;
}

export interface AddMemoryResponse {
  extractionId: string;
}

export interface SearchParams {
  query: string;
  scope: Scope;
  scopeId: string;
  limit?: number;
  includeGraph?: boolean;
}

export interface SearchResult {
  id: string;
  content: string;
  score: number;
  scope: Scope;
  scopeId: string;
  createdAt: string;
  updatedAt: string;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
}

export interface Fact {
  id: string;
  content: string;
  scope: Scope;
  scopeId: string;
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

export interface FactHistory {
  id: string;
  factId: string;
  content: string;
  action: string;
  createdAt: string;
}

export interface FeedbackParams {
  factId: string;
  wasUseful: boolean;
  feedbackType: 'explicit_positive' | 'explicit_negative';
}

// ── Sessions ──

export interface Session {
  id: string;
  scope: Scope;
  scopeId: string;
  startedAt: string;
  endedAt?: string;
}

// ── Triggers ──

export interface TriggerCondition {
  topicMatch?: string[];
}

export interface CreateTriggerParams {
  scope: Scope;
  scopeId: string;
  condition: TriggerCondition;
}

export interface Trigger {
  id: string;
  scope: Scope;
  scopeId: string;
  condition: TriggerCondition;
  createdAt: string;
}

// ── Keys ──

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
}

// ── Profile ──

export interface UserProfile {
  userId: string;
  factsCount: number;
  firstSeen: string;
  lastSeen: string;
  topTopics: string[];
}

// ── Usage ──

export interface UsageResponse {
  memoriesStored: number;
  searchesThisMonth: number;
  extractionsThisMonth: number;
}

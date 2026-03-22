import type { HttpClient } from '../http.js';
import type {
  AddMemoryParams,
  AddMemoryResponse,
  Fact,
  FactHistory,
  FeedbackParams,
  SearchParams,
  SearchResponse,
} from '../types.js';

export class MemoryClient {
  constructor(private readonly http: HttpClient) {}

  /** Extract and store memories from text or conversation. */
  async add(params: AddMemoryParams): Promise<AddMemoryResponse> {
    return this.http.request('POST', '/v1/memory', params);
  }

  /** Semantic search over stored memories. */
  async search(params: SearchParams): Promise<SearchResponse> {
    return this.http.request('POST', '/v1/memory/search', params);
  }

  /** Submit feedback on a retrieved fact. */
  async feedback(params: FeedbackParams): Promise<void> {
    return this.http.request('POST', '/v1/feedback', params);
  }

  /** Get a single fact by ID. */
  async get(factId: string): Promise<Fact> {
    return this.http.request('GET', `/v1/memory/${factId}`);
  }

  /** Get the edit history of a fact. */
  async history(factId: string): Promise<FactHistory[]> {
    return this.http.request('GET', `/v1/memory/${factId}/history`);
  }

  /** Delete a single fact. */
  async delete(factId: string): Promise<void> {
    return this.http.request('DELETE', `/v1/memory/${factId}`);
  }

  /** Purge all memories for a scope. */
  async purge(scope: string, scopeId: string): Promise<void> {
    return this.http.request('DELETE', `/v1/memory`, { scope, scopeId });
  }
}

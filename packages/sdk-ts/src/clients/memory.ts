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

  /** Update a memory's content (creates new version, invalidates old). */
  async update(factId: string, content: string): Promise<any> {
    return this.http.request('PATCH', `/v1/memory/${factId}`, { content });
  }

  /** List memories (paginated). */
  async list(options: { scope: string; scopeId: string; limit?: number; cursor?: string }): Promise<any> {
    const params = new URLSearchParams({ scope: options.scope, scope_id: options.scopeId });
    if (options.limit) params.set('limit', String(options.limit));
    if (options.cursor) params.set('cursor', options.cursor);
    return this.http.request('GET', `/v1/memory?${params}`);
  }

  /** Export all data for a scope. */
  async export(scope: string, scopeId: string): Promise<any> {
    return this.http.request('GET', `/v1/export?scope=${scope}&scope_id=${scopeId}`);
  }

  /** Batch add memories. */
  async addBatch(items: Array<{ scope: string; scopeId: string; data: unknown; inputType?: string }>): Promise<any> {
    return this.http.request('POST', '/v1/memory/batch', { items });
  }

  /** Batch search memories. */
  async searchBatch(queries: Array<{ query: string; scope: string; scopeId: string; limit?: number }>): Promise<any> {
    return this.http.request('POST', '/v1/memory/search/batch', { queries });
  }
}

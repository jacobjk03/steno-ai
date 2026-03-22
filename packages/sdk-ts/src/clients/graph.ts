import type { HttpClient } from '../http.js';

export class GraphClient {
  constructor(private readonly http: HttpClient) {}

  /** List entities (paginated). */
  async listEntities(options?: { limit?: number; cursor?: string }): Promise<any> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);
    return this.http.request('GET', `/v1/entities?${params}`);
  }

  /** Get a single entity by ID. */
  async getEntity(id: string): Promise<any> {
    return this.http.request('GET', `/v1/entities/${id}`);
  }

  /** Get related entities for a given entity. */
  async getRelated(entityId: string, depth?: number): Promise<any> {
    const params = depth ? `?depth=${depth}` : '';
    return this.http.request('GET', `/v1/entities/${entityId}/graph${params}`);
  }
}

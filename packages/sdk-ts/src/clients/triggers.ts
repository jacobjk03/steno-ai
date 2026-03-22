import type { HttpClient } from '../http.js';
import type { CreateTriggerParams, Trigger } from '../types.js';

export class TriggerClient {
  constructor(private readonly http: HttpClient) {}

  /** Create a memory trigger. */
  async create(params: CreateTriggerParams): Promise<Trigger> {
    return this.http.request('POST', '/v1/triggers', params);
  }

  /** List triggers for a scope. */
  async list(scope: string, scopeId: string): Promise<Trigger[]> {
    return this.http.request('GET', `/v1/triggers?scope=${scope}&scope_id=${scopeId}`);
  }

  /** Delete a trigger. */
  async delete(triggerId: string): Promise<void> {
    return this.http.request('DELETE', `/v1/triggers/${triggerId}`);
  }
}

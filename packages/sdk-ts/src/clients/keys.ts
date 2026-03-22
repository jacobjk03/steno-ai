import type { HttpClient } from '../http.js';
import type { ApiKey, UsageResponse } from '../types.js';

export class KeyClient {
  constructor(private readonly http: HttpClient) {}

  /** Create a new API key. */
  async create(name: string): Promise<ApiKey & { key: string }> {
    return this.http.request('POST', '/v1/keys', { name });
  }

  /** List all API keys. */
  async list(): Promise<ApiKey[]> {
    return this.http.request('GET', '/v1/keys');
  }

  /** Revoke an API key. */
  async revoke(keyId: string): Promise<void> {
    return this.http.request('DELETE', `/v1/keys/${keyId}`);
  }

  /** Get usage stats for the current key. */
  async usage(): Promise<UsageResponse> {
    return this.http.request('GET', '/v1/usage');
  }
}

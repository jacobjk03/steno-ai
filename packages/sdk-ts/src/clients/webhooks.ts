import type { HttpClient } from '../http.js';

export class WebhookClient {
  constructor(private readonly http: HttpClient) {}

  /** Create a webhook. */
  async create(options: { url: string; events: string[]; secret: string }): Promise<any> {
    return this.http.request('POST', '/v1/webhooks', options);
  }

  /** List all webhooks. */
  async list(): Promise<any> {
    return this.http.request('GET', '/v1/webhooks');
  }

  /** Delete a webhook by ID. */
  async delete(id: string): Promise<void> {
    return this.http.request('DELETE', `/v1/webhooks/${id}`);
  }
}

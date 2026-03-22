import type { HttpClient } from '../http.js';
import type { Session } from '../types.js';

export class SessionClient {
  constructor(private readonly http: HttpClient) {}

  /** Start a new memory session. */
  async start(scope: string, scopeId: string): Promise<Session> {
    return this.http.request('POST', '/v1/sessions', { scope, scopeId });
  }

  /** End an active session. */
  async end(sessionId: string): Promise<void> {
    return this.http.request('POST', `/v1/sessions/${sessionId}/end`);
  }
}

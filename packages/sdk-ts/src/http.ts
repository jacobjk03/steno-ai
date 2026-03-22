import { StenoError } from './errors.js';

/**
 * Low-level HTTP client. Handles auth, JSON serialization, snake/camel
 * conversion, rate-limit retries, and error mapping.
 */
export class HttpClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
  ) {}

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(toSnakeCase(body)) : undefined,
    });

    // Rate-limit: retry once after the indicated delay
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('retry-after') ?? '5', 10);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      return this.request(method, path, body);
    }

    if (!res.ok) {
      const error = await res
        .json()
        .catch(() => ({ error: { message: res.statusText } })) as {
          error?: { code?: string; message?: string };
        };
      throw new StenoError(
        error.error?.code ?? 'unknown',
        error.error?.message ?? res.statusText,
        res.status,
      );
    }

    // 204 No Content — nothing to parse
    if (res.status === 204) return undefined as T;

    const json = (await res.json()) as { data?: unknown };
    return toCamelCase(json.data ?? json) as T;
  }
}

// ── Case conversion helpers ──

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

export function toSnakeCase(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toSnakeCase);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[camelToSnake(key)] = toSnakeCase(value);
    }
    return result;
  }
  return obj;
}

export function toCamelCase(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[snakeToCamel(key)] = toCamelCase(value);
    }
    return result;
  }
  return obj;
}

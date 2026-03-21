/**
 * Wire-format conversion utilities.
 *
 * API payloads use snake_case; internal TypeScript objects use camelCase.
 * These helpers recursively convert between the two conventions, also
 * serialising Date objects to ISO 8601 strings.
 */

// camelCase -> snake_case  e.g. "scopeId" -> "scope_id"
function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
}

// snake_case -> camelCase  e.g. "scope_id" -> "scopeId"
function snakeToCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

function convertKeys(obj: unknown, keyFn: (k: string) => string): unknown {
  if (obj === null || obj === undefined) return obj;

  if (obj instanceof Date) return obj.toISOString();

  if (Array.isArray(obj)) {
    return obj.map((item) => convertKeys(item, keyFn));
  }

  if (isPlainObject(obj)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[keyFn(key)] = convertKeys(value, keyFn);
    }
    return result;
  }

  // Primitives (string, number, boolean, etc.) pass through unchanged
  return obj;
}

/** Convert a camelCase object (or array) to snake_case for API responses. */
export function toSnakeCaseWire(obj: unknown): unknown {
  return convertKeys(obj, camelToSnake);
}

/** Convert a snake_case object (or array) to camelCase for internal use. */
export function toCamelCaseWire(obj: unknown): unknown {
  return convertKeys(obj, snakeToCamel);
}

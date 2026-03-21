/**
 * Cursor-based pagination utilities.
 * Encodes a (timestamp, id) pair for reliable ordering even when timestamps collide.
 */

export interface CursorData {
  ts: string;
  id: string;
}

export function encodeCursor(ts: string, id: string): string {
  return Buffer.from(JSON.stringify({ ts, id }), 'utf-8').toString('base64');
}

export function decodeCursor(cursor: string): CursorData {
  return JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8')) as CursorData;
}

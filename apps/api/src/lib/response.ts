import type { Context } from 'hono';
import { toSnakeCaseWire } from './wire-format.js';

/**
 * Standard success response.
 *
 * Returns: `{ "data": <snake_case payload> }`
 */
export function successResponse(c: Context, data: unknown, status?: number) {
  return c.json({ data: toSnakeCaseWire(data) }, (status ?? 200) as 200);
}

/**
 * Paginated list response.
 *
 * Returns: `{ "data": [...], "cursor": "...", "has_more": true }`
 */
export function paginatedResponse(
  c: Context,
  data: unknown[],
  cursor: string | null,
  hasMore: boolean,
) {
  return c.json({
    data: toSnakeCaseWire(data),
    cursor,
    has_more: hasMore,
  });
}

/**
 * Standard error response.
 *
 * Returns: `{ "error": { "code": "...", "message": "...", "status": 400, "request_id": "..." } }`
 */
export function errorResponse(
  c: Context,
  code: string,
  message: string,
  status: number,
  extra?: Record<string, unknown>,
) {
  return c.json(
    {
      error: {
        code,
        message,
        status,
        request_id: c.get('requestId' as never),
        ...extra,
      },
    },
    status as 400,
  );
}

/**
 * 202 Accepted response for async operations.
 *
 * Returns: `{ "extraction_id": "...", "status": "queued", "poll_url": "/v1/extractions/..." }`
 */
export function acceptedResponse(c: Context, extractionId: string) {
  return c.json(
    {
      extraction_id: extractionId,
      status: 'queued',
      poll_url: `/v1/extractions/${extractionId}`,
    },
    202,
  );
}

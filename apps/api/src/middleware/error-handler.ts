import type { ErrorHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export class StenoError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'StenoError';
  }
}

export const badRequest = (message: string) => new StenoError('bad_request', message, 400);
export const unauthorized = (message: string) => new StenoError('unauthorized', message, 401);
export const forbidden = (message: string) => new StenoError('forbidden', message, 403);
export const notFound = (message: string) => new StenoError('not_found', message, 404);
export const conflict = (message: string, extra?: Record<string, unknown>) =>
  new StenoError('conflict', message, 409, extra);
export const payloadTooLarge = (message: string) =>
  new StenoError('payload_too_large', message, 413);

export const globalErrorHandler: ErrorHandler = (err, c) => {
  const requestId =
    (c.get as (key: string) => string | undefined)('requestId') ?? 'unknown';

  if (err instanceof StenoError) {
    return c.json(
      {
        error: {
          code: err.code,
          message: err.message,
          status: err.status,
          request_id: requestId,
          ...(err.extra ?? {}),
        },
      },
      err.status as ContentfulStatusCode,
    );
  }

  console.error('[steno] Unhandled error:', err);
  return c.json(
    {
      error: {
        code: 'internal_error',
        message: 'An unexpected error occurred',
        status: 500,
        request_id: requestId,
      },
    },
    500,
  );
};

import type { MiddlewareHandler } from 'hono';
import type { z } from 'zod';
import { toCamelCaseWire } from '../lib/wire-format.js';

const MAX_BODY_SIZE = 5 * 1024 * 1024; // 5MB

export function validate<T extends z.ZodType>(schema: T): MiddlewareHandler {
  return async (c, next) => {
    const contentLength = c.req.header('Content-Length');
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return c.json(
        {
          error: {
            code: 'payload_too_large',
            message: 'Request body exceeds maximum size of 5MB',
            status: 413,
            request_id:
              (c.get as (key: string) => string | undefined)('requestId') ??
              'unknown',
          },
        },
        413,
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json(
        {
          error: {
            code: 'bad_request',
            message: 'Invalid JSON in request body',
            status: 400,
            request_id:
              (c.get as (key: string) => string | undefined)('requestId') ??
              'unknown',
          },
        },
        400,
      );
    }

    const camelBody = toCamelCaseWire(rawBody);
    const result = schema.safeParse(camelBody);

    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'bad_request',
            message: 'Invalid request body',
            status: 400,
            request_id:
              (c.get as (key: string) => string | undefined)('requestId') ??
              'unknown',
            details: result.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          },
        },
        400,
      );
    }

    (c as unknown as { set: (key: string, value: unknown) => void }).set(
      'validatedBody',
      result.data,
    );
    await next();
  };
}

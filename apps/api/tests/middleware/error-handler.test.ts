import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import {
  globalErrorHandler,
  StenoError,
  badRequest,
  notFound,
  conflict,
  payloadTooLarge,
} from '../../src/middleware/error-handler.js';

describe('globalErrorHandler', () => {
  function createApp(throwFn: () => never) {
    const app = new Hono();
    app.onError(globalErrorHandler);
    app.get('/test', () => {
      throwFn();
    });
    return app;
  }

  it('handles StenoError with correct status and code', async () => {
    const app = createApp(() => {
      throw badRequest('bad input');
    });
    const res = await app.request('/test');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('bad_request');
    expect(body.error.message).toBe('bad input');
  });

  it('handles notFound', async () => {
    const app = createApp(() => {
      throw notFound('not here');
    });
    const res = await app.request('/test');
    expect(res.status).toBe(404);
  });

  it('handles conflict with extra data', async () => {
    const app = createApp(() => {
      throw conflict('duplicate', { existing_id: 'abc' });
    });
    const res = await app.request('/test');
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.existing_id).toBe('abc');
  });

  it('handles payloadTooLarge', async () => {
    const app = createApp(() => {
      throw payloadTooLarge('too big');
    });
    const res = await app.request('/test');
    expect(res.status).toBe(413);
  });

  it('handles unknown Error as 500', async () => {
    const app = createApp(() => {
      throw new Error('oops');
    });
    const res = await app.request('/test');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('internal_error');
  });

  it('includes request_id in error responses', async () => {
    const app = createApp(() => {
      throw badRequest('test');
    });
    const res = await app.request('/test');
    const body = await res.json();
    expect(body.error.request_id).toBeDefined();
  });

  it('StenoError is an instance of Error', () => {
    const err = new StenoError('test', 'msg', 400);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(StenoError);
    expect(err.name).toBe('StenoError');
  });
});

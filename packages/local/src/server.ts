import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createStenoLocal } from './steno-local.js';
import type { StenoLocal } from './steno-local.js';
import type { StenoLocalConfig } from './config.js';

export interface StenoServer {
  start(): void;
  stop(): void;
  steno: StenoLocal;
  /** The Hono app, exposed for testing without starting a real server. */
  app: Hono;
}

export function createStenoServer(config: StenoLocalConfig & { port?: number }): StenoServer {
  const steno = createStenoLocal(config);
  const app = new Hono();

  // Health
  app.get('/health', (c) => c.json({ status: 'ok', mode: 'local' }));

  // Memory — add
  app.post('/v1/memory', async (c) => {
    const body = await c.req.json();
    const result = await steno.memory.add(body);
    return c.json({ data: result });
  });

  // Memory — search
  app.post('/v1/memory/search', async (c) => {
    const body = await c.req.json();
    const result = await steno.memory.search(body);
    return c.json({ data: result });
  });

  // Memory — list
  app.get('/v1/memory', async (c) => {
    const scope = c.req.query('scope') ?? '';
    const scopeId = c.req.query('scope_id') ?? '';
    const limit = parseInt(c.req.query('limit') ?? '20', 10);
    const cursor = c.req.query('cursor');
    const result = await steno.memory.list({ scope, scopeId, limit, cursor });
    return c.json({ data: result.data, cursor: result.cursor, has_more: result.hasMore });
  });

  // Memory — get
  app.get('/v1/memory/:id', async (c) => {
    const id = c.req.param('id');
    const result = await steno.memory.get(id);
    if (!result) return c.json({ error: 'Not found' }, 404);
    return c.json({ data: result });
  });

  // Memory — delete
  app.delete('/v1/memory/:id', async (c) => {
    const id = c.req.param('id');
    await steno.memory.delete(id);
    return c.json({ success: true });
  });

  // Sessions — start
  app.post('/v1/sessions', async (c) => {
    const body = await c.req.json();
    const result = await steno.sessions.start(body);
    return c.json({ data: result });
  });

  // Sessions — end
  app.post('/v1/sessions/:id/end', async (c) => {
    const id = c.req.param('id');
    const result = await steno.sessions.end(id);
    return c.json({ data: result });
  });

  // Sessions — list
  app.get('/v1/sessions', async (c) => {
    const scope = c.req.query('scope') ?? '';
    const scopeId = c.req.query('scope_id') ?? '';
    const result = await steno.sessions.list({ scope, scopeId });
    return c.json({ data: result.data, cursor: result.cursor, has_more: result.hasMore });
  });

  // Triggers — create
  app.post('/v1/triggers', async (c) => {
    const body = await c.req.json();
    const result = await steno.triggers.create(body);
    return c.json({ data: result });
  });

  // Triggers — list
  app.get('/v1/triggers', async (c) => {
    const scope = c.req.query('scope') ?? '';
    const scopeId = c.req.query('scope_id') ?? '';
    const result = await steno.triggers.list(scope, scopeId);
    return c.json({ data: result });
  });

  // Export
  app.get('/v1/export', async (c) => {
    const scope = c.req.query('scope') ?? '';
    const scopeId = c.req.query('scope_id') ?? '';
    const result = await steno.export(scope, scopeId);
    return c.json({ data: result });
  });

  const port = config.port ?? 7540;
  let server: ReturnType<typeof serve> | null = null;

  return {
    start() {
      server = serve({ fetch: app.fetch, port });
      console.log(`[steno] Local server running at http://localhost:${port}`);
    },
    stop() {
      server?.close();
      steno.close();
    },
    steno,
    app,
  };
}

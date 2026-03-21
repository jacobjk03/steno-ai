import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../env.js';
import type { AppVariables } from '../app.js';
import { getAdapters } from '../lib/context.js';
import {
  successResponse,
  paginatedResponse,
  acceptedResponse,
} from '../lib/response.js';
import { toSnakeCaseWire } from '../lib/wire-format.js';
import { authMiddleware, validate, notFound, conflict, badRequest } from '../middleware/index.js';
import { hashInput, inputToText } from '@steno-ai/engine';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const MessageSchema = z.object({
  role: z.string().min(1),
  content: z.string().min(1).max(50000),
});

const ConversationDataSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(100),
});

const MemoryInputSchema = z.object({
  scope: z.enum(['user', 'agent', 'session', 'hive']),
  scopeId: z.string().min(1),
  inputType: z.enum([
    'conversation',
    'document',
    'url',
    'raw_text',
    'image',
    'audio',
    'code',
  ]),
  data: z.unknown(),
  sessionId: z.string().uuid().optional(),
});

const BatchMemoryInputSchema = z.object({
  items: z.array(MemoryInputSchema).min(1).max(50),
});

// ---------------------------------------------------------------------------
// Route group
// ---------------------------------------------------------------------------

const memory = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// ---------------------------------------------------------------------------
// POST /  — Async extraction (202)
// ---------------------------------------------------------------------------

memory.post(
  '/',
  authMiddleware('write'),
  validate(MemoryInputSchema),
  async (c) => {
    const body = c.get('validatedBody') as z.infer<typeof MemoryInputSchema>;
    const tenantId = c.get('tenantId');
    const adapters = getAdapters(c);

    // Validate conversation data shape when inputType is 'conversation'
    if (body.inputType === 'conversation') {
      const parsed = ConversationDataSchema.safeParse(body.data);
      if (!parsed.success) {
        throw badRequest(
          'Invalid conversation data: must include messages array with role and content',
        );
      }
    }

    // Hash input for dedup check
    const inputHash = await hashInput({
      type: body.inputType,
      data: body.data,
    });

    // Check for duplicate
    const existing = await adapters.storage.getExtractionByHash(
      tenantId,
      inputHash,
    );
    if (existing) {
      throw conflict('Duplicate input already submitted', {
        existing_extraction_id: existing.id,
      });
    }

    // Convert data to text for storage
    const textContent = inputToText({
      tenantId,
      scope: body.scope,
      scopeId: body.scopeId,
      inputType: body.inputType,
      data: body.data,
    });

    // Create extraction record with status='queued'
    const extractionId = crypto.randomUUID();
    await adapters.storage.createExtraction({
      id: extractionId,
      tenantId,
      inputType: body.inputType,
      inputData: textContent,
      inputHash,
      inputSize: textContent.length,
      scope: body.scope,
      scopeId: body.scopeId,
      sessionId: body.sessionId,
    });

    // Enqueue for async processing
    try {
      await c.env.EXTRACTION_QUEUE.send({
        tenantId,
        extractionId,
        scope: body.scope,
        scopeId: body.scopeId,
        inputType: body.inputType,
        data: body.data,
        sessionId: body.sessionId,
      });
    } catch (err) {
      // Queue not available (local dev) — log warning
      console.warn('[steno] Queue not available, extraction will need manual processing:', err);
    }

    return acceptedResponse(c, extractionId);
  },
);

// ---------------------------------------------------------------------------
// POST /batch  — Async batch extraction (202)
// ---------------------------------------------------------------------------

memory.post(
  '/batch',
  authMiddleware('write'),
  validate(BatchMemoryInputSchema),
  async (c) => {
    const body = c.get('validatedBody') as z.infer<
      typeof BatchMemoryInputSchema
    >;
    const tenantId = c.get('tenantId');
    const adapters = getAdapters(c);

    const results: Array<{ extraction_id: string; poll_url: string }> = [];

    for (const item of body.items) {
      const textContent = inputToText({
        tenantId,
        scope: item.scope,
        scopeId: item.scopeId,
        inputType: item.inputType,
        data: item.data,
      });

      const inputHash = await hashInput({
        type: item.inputType,
        data: item.data,
      });

      const extractionId = crypto.randomUUID();
      await adapters.storage.createExtraction({
        id: extractionId,
        tenantId,
        inputType: item.inputType,
        inputData: textContent,
        inputHash,
        inputSize: textContent.length,
        scope: item.scope,
        scopeId: item.scopeId,
        sessionId: item.sessionId,
      });

      results.push({
        extraction_id: extractionId,
        poll_url: `/v1/extractions/${extractionId}`,
      });
    }

    // Enqueue all for async processing
    try {
      for (let i = 0; i < body.items.length; i++) {
        const item = body.items[i]!;
        const result = results[i]!;
        await c.env.EXTRACTION_QUEUE.send({
          tenantId,
          extractionId: result.extraction_id,
          scope: item.scope,
          scopeId: item.scopeId,
          inputType: item.inputType,
          data: item.data,
          sessionId: item.sessionId,
        });
      }
    } catch (err) {
      // Queue not available (local dev) — log warning
      console.warn('[steno] Queue not available, extractions will need manual processing:', err);
    }

    return c.json({ extractions: results, status: 'queued' }, 202);
  },
);

// ---------------------------------------------------------------------------
// GET /  — List facts (paginated)
// ---------------------------------------------------------------------------

memory.get('/', authMiddleware('read'), async (c) => {
  const scope = c.req.query('scope');
  const scopeId = c.req.query('scope_id');

  if (!scope || !scopeId) {
    throw badRequest('scope and scope_id query parameters are required');
  }

  const limit = Math.min(
    Math.max(parseInt(c.req.query('limit') ?? '20', 10) || 20, 1),
    100,
  );
  const cursor = c.req.query('cursor') ?? undefined;

  const tenantId = c.get('tenantId');
  const adapters = getAdapters(c);

  const result = await adapters.storage.getFactsByScope(
    tenantId,
    scope,
    scopeId,
    { limit, cursor },
  );

  return paginatedResponse(c, result.data, result.cursor, result.hasMore);
});

// ---------------------------------------------------------------------------
// DELETE /purge  — GDPR hard delete
// ---------------------------------------------------------------------------

memory.delete('/purge', authMiddleware('admin'), async (c) => {
  const scope = c.req.query('scope');
  const scopeId = c.req.query('scope_id');

  if (!scope || !scopeId) {
    throw badRequest('scope and scope_id query parameters are required');
  }

  const tenantId = c.get('tenantId');
  const adapters = getAdapters(c);

  const count = await adapters.storage.purgeFacts(tenantId, scope, scopeId);

  return c.json(toSnakeCaseWire({ purged: true, factsDeleted: count }));
});

// ---------------------------------------------------------------------------
// GET /:id  — Get specific fact
// ---------------------------------------------------------------------------

memory.get('/:id', authMiddleware('read'), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId');
  const adapters = getAdapters(c);

  const fact = await adapters.storage.getFact(tenantId, id);
  if (!fact) {
    throw notFound(`Fact ${id} not found`);
  }

  return successResponse(c, fact);
});

// ---------------------------------------------------------------------------
// DELETE /:id  — Soft delete (invalidate)
// ---------------------------------------------------------------------------

memory.delete('/:id', authMiddleware('write'), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId');
  const adapters = getAdapters(c);

  // Verify fact exists
  const fact = await adapters.storage.getFact(tenantId, id);
  if (!fact) {
    throw notFound(`Fact ${id} not found`);
  }

  await adapters.storage.invalidateFact(tenantId, id);

  return successResponse(c, { id, invalidated: true });
});

// ---------------------------------------------------------------------------
// GET /:id/history  — Fact lineage
// ---------------------------------------------------------------------------

memory.get('/:id/history', authMiddleware('read'), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId');
  const adapters = getAdapters(c);

  // Get the fact to find its lineageId
  const fact = await adapters.storage.getFact(tenantId, id);
  if (!fact) {
    throw notFound(`Fact ${id} not found`);
  }

  const versions = await adapters.storage.getFactsByLineage(
    tenantId,
    fact.lineageId,
  );

  return successResponse(c, { factId: id, lineageId: fact.lineageId, versions });
});

// ---------------------------------------------------------------------------
// Export — also create the /v1/export route on a separate group
// ---------------------------------------------------------------------------

const exportRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

exportRoutes.get('/', authMiddleware('admin'), async (c) => {
  const scope = c.req.query('scope');
  const scopeId = c.req.query('scope_id');
  const format = c.req.query('format') ?? 'json';

  if (!scope || !scopeId) {
    throw badRequest('scope and scope_id query parameters are required');
  }

  if (format !== 'json') {
    throw badRequest('Only json format is currently supported');
  }

  const tenantId = c.get('tenantId');
  const adapters = getAdapters(c);

  // Gather all data for the scope
  const facts = await adapters.storage.getFactsByScope(
    tenantId,
    scope,
    scopeId,
    { limit: 10000 },
  );

  const entities = await adapters.storage.getEntitiesForTenant(tenantId, {
    limit: 10000,
  });

  const sessions = await adapters.storage.getSessionsByScope(
    tenantId,
    scope,
    scopeId,
    { limit: 10000 },
  );

  return c.json(
    toSnakeCaseWire({
      scope,
      scopeId,
      facts: facts.data,
      entities: entities.data,
      sessions: sessions.data,
      exportedAt: new Date(),
    }),
  );
});

export { memory as memoryRoutes, exportRoutes };

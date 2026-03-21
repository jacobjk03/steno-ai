import type { Env } from '../env.js';
import { createAdapters } from '../lib/adapters.js';
import { runExtractionFromQueue } from '@steno-ai/engine';
import type { ExtractionInput, Scope } from '@steno-ai/engine';

export interface ExtractionMessage {
  tenantId: string;
  extractionId: string;
  scope: string;
  scopeId: string;
  inputType: string;
  data: unknown;
  sessionId?: string;
}

export async function handleExtractionQueue(
  batch: MessageBatch<ExtractionMessage>,
  env: Env,
): Promise<void> {
  const adapters = createAdapters(env);

  for (const message of batch.messages) {
    const msg = message.body;

    try {
      const input: ExtractionInput = {
        tenantId: msg.tenantId,
        scope: msg.scope as Scope,
        scopeId: msg.scopeId,
        inputType: msg.inputType as ExtractionInput['inputType'],
        data: msg.data,
        sessionId: msg.sessionId,
      };

      const config = {
        storage: adapters.storage,
        embedding: adapters.embedding,
        cheapLLM: adapters.cheapLLM,
        smartLLM: adapters.smartLLM,
        embeddingModel: env.EMBEDDING_MODEL ?? 'text-embedding-3-small',
        embeddingDim: parseInt(env.EMBEDDING_DIM ?? '1536', 10),
      };

      await runExtractionFromQueue(config, msg.extractionId, input);

      // TODO: Deliver webhook on success (extraction.completed)

      message.ack();
    } catch (err) {
      console.error(`[steno] Extraction failed for ${msg.extractionId}:`, err);

      // TODO: Deliver webhook on failure (extraction.failed)

      message.retry();
    }
  }
}

import { createApp } from './app.js';
import { handleExtractionQueue } from './queue/extraction-worker.js';
import { handleWebhookQueue } from './queue/webhook-sender.js';
import type { Env } from './env.js';

const app = createApp();

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    switch (batch.queue) {
      case 'steno-extraction':
        await handleExtractionQueue(batch as MessageBatch<any>, env);
        break;
      case 'steno-webhooks':
        await handleWebhookQueue(batch as MessageBatch<any>, env);
        break;
      default:
        console.error(`[steno] Unknown queue: ${batch.queue}`);
    }
  },
};

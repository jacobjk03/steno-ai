import { createApp } from './app.js';
import { handleExtractionQueue } from './queue/extraction-worker.js';
import type { ExtractionMessage } from './queue/extraction-worker.js';
import type { Env } from './env.js';

const app = createApp();

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<ExtractionMessage>, env: Env): Promise<void> {
    await handleExtractionQueue(batch, env);
  },
};

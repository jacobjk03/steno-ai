import type { Env } from '../env.js';

export async function dispatchWebhookEvent(
  env: Env,
  tenantId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    if (env.WEBHOOK_QUEUE) {
      await env.WEBHOOK_QUEUE.send({ tenantId, event, payload });
    }
  } catch (err) {
    console.warn('[steno] Failed to enqueue webhook event:', err);
  }
}

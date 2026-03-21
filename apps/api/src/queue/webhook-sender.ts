import type { Env } from '../env.js';
import { createAdapters } from '../lib/adapters.js';
import { signWebhookPayload } from '../lib/webhook.js';

export interface WebhookMessage {
  tenantId: string;
  event: string; // 'extraction.completed', 'extraction.failed', etc.
  payload: Record<string, unknown>;
}

export async function handleWebhookQueue(
  batch: MessageBatch<WebhookMessage>,
  env: Env,
): Promise<void> {
  const adapters = createAdapters(env);

  for (const message of batch.messages) {
    const { tenantId, event, payload } = message.body;

    try {
      // 1. Find all webhooks registered for this event
      const webhooks = await adapters.storage.getWebhooksByEvent(tenantId, event);

      if (webhooks.length === 0) {
        message.ack(); // No webhooks registered -- nothing to do
        continue;
      }

      // 2. Deliver to each webhook
      const payloadStr = JSON.stringify({
        event,
        data: payload,
        timestamp: new Date().toISOString(),
      });

      for (const webhook of webhooks) {
        // Sign the payload with the webhook's ID as deterministic signing key.
        // NOTE: We store secretHash (bcrypt), but HMAC signing needs the raw secret.
        // TODO: Implement proper HMAC with stored secret
        const signature = await signWebhookPayload(payloadStr, webhook.id);

        try {
          const response = await fetch(webhook.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Steno-Signature': signature,
              'X-Steno-Event': event,
            },
            body: payloadStr,
          });

          if (!response.ok) {
            console.warn(
              `[steno] Webhook delivery failed for ${webhook.id}: HTTP ${response.status}`,
            );
          }
        } catch (fetchErr) {
          console.error(`[steno] Webhook delivery error for ${webhook.id}:`, fetchErr);
          // Individual webhook fetch failure -- continue to other webhooks
        }
      }

      message.ack();
    } catch (err) {
      console.error(`[steno] Webhook processing failed:`, err);
      message.retry();
    }
  }
}

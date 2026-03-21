import { describe, it, expect } from 'vitest';
import { signWebhookPayload } from '../../src/lib/webhook.js';

describe('signWebhookPayload', () => {
  const secret = 'test-secret-key-1234';
  const payload = '{"event":"extraction.completed","id":"abc"}';

  it('produces a consistent hex signature for the same payload + secret', async () => {
    const sig1 = await signWebhookPayload(payload, secret);
    const sig2 = await signWebhookPayload(payload, secret);
    expect(sig1).toBe(sig2);
    // HMAC-SHA256 produces 32 bytes = 64 hex chars
    expect(sig1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different signatures for different payloads', async () => {
    const sig1 = await signWebhookPayload('payload-one', secret);
    const sig2 = await signWebhookPayload('payload-two', secret);
    expect(sig1).not.toBe(sig2);
  });

  it('produces different signatures for different secrets', async () => {
    const sig1 = await signWebhookPayload(payload, 'secret-alpha-1234567');
    const sig2 = await signWebhookPayload(payload, 'secret-bravo-1234567');
    expect(sig1).not.toBe(sig2);
  });
});

import type { Context } from 'hono';
import type { Env } from '../env.js';
import type { AppVariables } from '../app.js';
import type { Adapters } from './adapters.js';
import { createAdapters } from './adapters.js';

/**
 * Get (or lazily create) the adapter instances for the current request.
 *
 * Adapters are cached on the Hono context so they are only created once per
 * request, regardless of how many times this helper is called.
 */
export function getAdapters(c: Context<{ Bindings: Env; Variables: AppVariables }>): Adapters {
  let adapters = c.get('adapters') as Adapters | undefined;
  if (!adapters) {
    adapters = createAdapters(c.env);
    c.set('adapters', adapters as never);
  }
  return adapters;
}

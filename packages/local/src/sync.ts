import type { StenoLocal } from './steno-local.js';

export interface SyncConfig {
  apiKey: string;
  cloudUrl: string;
  dryRun?: boolean;
}

/**
 * Sync local data to cloud.
 * 1. Export all facts/entities/sessions from local SQLite
 * 2. POST each fact to cloud API (cloud will re-embed with its own model)
 * 3. Report progress and count
 */
export async function syncToCloud(
  steno: StenoLocal,
  config: SyncConfig & { scope?: string; scopeId?: string },
): Promise<{ factsSynced: number; entitiesSynced: number }> {
  const data = await steno.export(config.scope ?? 'user', config.scopeId ?? '*');

  if (config.dryRun) {
    console.log('[steno sync] Dry run:');
    console.log(`  Facts to sync: ${data.facts?.length ?? 0}`);
    console.log(`  Entities to sync: ${data.entities?.length ?? 0}`);
    console.log(`  Sessions to sync: ${data.sessions?.length ?? 0}`);
    const estimatedCost = ((data.facts?.length ?? 0) * 0.0001).toFixed(4);
    console.log(`  Estimated re-embedding cost: ~$${estimatedCost}`);
    return { factsSynced: 0, entitiesSynced: 0 };
  }

  let factsSynced = 0;
  let entitiesSynced = 0;

  for (const fact of (data.facts ?? [])) {
    try {
      const response = await fetch(`${config.cloudUrl}/v1/memory`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scope: fact.scope,
          scope_id: fact.scopeId,
          input_type: 'raw_text',
          data: fact.content,
        }),
      });
      if (response.ok) {
        factsSynced++;
      } else {
        console.warn(`[steno sync] Failed to sync fact ${fact.id}: HTTP ${response.status}`);
      }
    } catch (err) {
      console.warn(`[steno sync] Error syncing fact ${fact.id}:`, err);
    }
  }

  console.log(`[steno sync] Synced ${factsSynced} facts, ${entitiesSynced} entities`);
  return { factsSynced, entitiesSynced };
}

/**
 * Sync cloud data to local.
 * 1. GET facts from cloud API
 * 2. Import into local SQLite
 */
export async function syncFromCloud(
  steno: StenoLocal,
  config: SyncConfig,
): Promise<{ factsImported: number; entitiesImported: number }> {
  const response = await fetch(`${config.cloudUrl}/v1/export?scope=user&scope_id=*&format=json`, {
    headers: { 'Authorization': `Bearer ${config.apiKey}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch from cloud: HTTP ${response.status}`);
  }

  const data = await response.json();
  return steno.import(data.data ?? data);
}

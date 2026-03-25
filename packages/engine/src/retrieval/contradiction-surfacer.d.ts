import type { StorageAdapter } from '../adapters/storage.js';
import type { FusionResult } from './fusion.js';
import type { SearchResult } from './types.js';
/**
 * Enrich fusion results with contradiction context.
 * For each result where the fact has an active contradiction,
 * fetch the contradicted fact and build a timeline description.
 */
export declare function surfaceContradictions(storage: StorageAdapter, tenantId: string, results: FusionResult[]): Promise<SearchResult[]>;
/**
 * Build a human-readable timeline description of a contradiction.
 * Examples:
 * - "Opinion changed over ~2 months"
 * - "Updated after 3 days"
 * - "Superseded on the same day"
 */
export declare function buildTimeline(oldValidFrom: Date, _oldValidUntil: Date | null, newValidFrom: Date): string;
//# sourceMappingURL=contradiction-surfacer.d.ts.map
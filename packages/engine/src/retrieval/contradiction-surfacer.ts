import type { StorageAdapter } from '../adapters/storage.js';
import type { FusionResult } from './fusion.js';
import type { SearchResult } from './types.js';

/**
 * Enrich fusion results with contradiction context.
 * For each result where the fact has an active contradiction,
 * fetch the contradicted fact and build a timeline description.
 */
export async function surfaceContradictions(
  storage: StorageAdapter,
  tenantId: string,
  results: FusionResult[],
): Promise<SearchResult[]> {
  const enriched: SearchResult[] = [];

  for (const result of results) {
    const { fact } = result;

    let contradiction: SearchResult['contradiction'] | undefined;

    if (
      fact.contradictionStatus !== 'none' &&
      fact.contradictsId
    ) {
      const contradictedFact = await storage.getFact(tenantId, fact.contradictsId);

      if (contradictedFact) {
        const timeline = buildTimeline(
          contradictedFact.validFrom,
          contradictedFact.validUntil,
          fact.validFrom,
        );

        contradiction = {
          contradicts: contradictedFact,
          status: fact.contradictionStatus,
          timeline,
        };
      }
      // If contradicted fact was deleted (GDPR purge), gracefully omit contradiction context
    }

    enriched.push({
      fact: result.fact,
      score: result.score,
      signals: result.signals,
      triggeredBy: result.triggeredBy,
      contradiction,
      // graph and history are filled in by the search orchestrator later
    });
  }

  return enriched;
}

/**
 * Build a human-readable timeline description of a contradiction.
 * Examples:
 * - "Opinion changed over ~2 months"
 * - "Updated after 3 days"
 * - "Superseded on the same day"
 */
export function buildTimeline(
  oldValidFrom: Date,
  _oldValidUntil: Date | null,
  newValidFrom: Date,
): string {
  const oldDate = new Date(oldValidFrom);
  const newDate = new Date(newValidFrom);
  const diffMs = newDate.getTime() - oldDate.getTime();
  const diffDays = Math.abs(Math.round(diffMs / (1000 * 60 * 60 * 24)));

  if (diffDays === 0) return 'Superseded on the same day';
  if (diffDays === 1) return 'Updated after 1 day';
  if (diffDays < 7) return `Updated after ${diffDays} days`;
  if (diffDays < 30) {
    const weeks = Math.round(diffDays / 7);
    return `Changed over ~${weeks} week${weeks === 1 ? '' : 's'}`;
  }
  if (diffDays < 365) {
    const months = Math.round(diffDays / 30);
    return `Changed over ~${months} month${months === 1 ? '' : 's'}`;
  }
  const years = Math.round(diffDays / 365);
  return `Changed over ~${years} year${years === 1 ? '' : 's'}`;
}

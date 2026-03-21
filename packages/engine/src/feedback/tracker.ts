import type { StorageAdapter } from '../adapters/storage.js';
import type { SearchResult } from '../retrieval/types.js';
import type { FeedbackType } from '../config.js';
import { calculateDecayScore } from '../salience/decay.js';

/**
 * Record memory accesses after a search.
 * Also updates last_accessed and frequency on accessed facts.
 * This is called fire-and-forget from the search orchestrator.
 */
export async function recordAccesses(
  storage: StorageAdapter,
  tenantId: string,
  query: string,
  results: SearchResult[],
): Promise<void> {
  const decayUpdates: Array<{ id: string; decayScore: number; lastAccessed: Date; frequency: number }> = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const id = crypto.randomUUID();

    // Create access record
    await storage.createMemoryAccess({
      id,
      tenantId,
      factId: result.fact.id,
      query,
      retrievalMethod: result.triggeredBy ? 'trigger' : 'fusion',
      similarityScore: result.signals.vectorScore > 0 ? result.signals.vectorScore : undefined,
      rankPosition: i + 1,
      triggerId: result.triggeredBy,
    });

    // Recalculate decay score with updated access time and frequency
    const newFrequency = result.fact.frequency + 1;
    const newDecayScore = calculateDecayScore({
      importance: result.fact.importance,
      frequency: newFrequency,
      lastAccessed: new Date(),
      halfLifeDays: 30,  // TODO: get from tenant config
      normalizationK: 50,
    });

    decayUpdates.push({
      id: result.fact.id,
      decayScore: newDecayScore,
      lastAccessed: new Date(),
      frequency: newFrequency,
    });
  }

  // Batch update decay scores (also updates last_accessed and frequency on the fact)
  if (decayUpdates.length > 0) {
    await storage.updateDecayScores(tenantId, decayUpdates);
  }
}

/**
 * Submit user feedback for a retrieved memory.
 * Adjusts the fact's importance score based on feedback.
 */
export async function submitFeedback(
  storage: StorageAdapter,
  tenantId: string,
  factId: string,
  feedback: {
    wasUseful: boolean;
    feedbackType: FeedbackType;
    feedbackDetail?: string;
  },
): Promise<void> {
  // 1. Update the memory access record with feedback
  await storage.updateFeedback(tenantId, factId, {
    wasUseful: feedback.wasUseful,
    feedbackType: feedback.feedbackType,
    feedbackDetail: feedback.feedbackDetail,
  });

  // 2. Adjust fact importance based on feedback
  const fact = await storage.getFact(tenantId, factId);
  if (!fact) return;

  let newImportance = fact.importance;

  switch (feedback.feedbackType) {
    case 'explicit_positive':
    case 'implicit_positive':
      newImportance = Math.min(1.0, fact.importance + 0.05);
      break;
    case 'explicit_negative':
    case 'implicit_negative':
      newImportance = Math.max(0.1, fact.importance - 0.05);
      break;
    case 'correction':
      newImportance = Math.max(0.1, fact.importance - 0.1);
      break;
  }

  // 3. Update the fact's importance and recalculate decay score
  if (newImportance !== fact.importance) {
    const newDecayScore = calculateDecayScore({
      importance: newImportance,
      frequency: fact.frequency,
      lastAccessed: fact.lastAccessed ?? new Date(),
      halfLifeDays: 30,
      normalizationK: 50,
    });

    await storage.updateDecayScores(tenantId, [
      { id: factId, decayScore: newDecayScore, importance: newImportance },
    ]);
  }
}

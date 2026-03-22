import type { StorageAdapter } from '../adapters/storage.js';

export interface UserProfile {
  userId: string;
  static: ProfileFact[];   // Long-term stable facts (name, company, allergies)
  dynamic: ProfileFact[];  // Recent/changing context (current project, mood)
  lastUpdated: Date | null;
}

export interface ProfileFact {
  id: string;
  content: string;
  importance: number;
  category: string;  // 'identity', 'preference', 'health', 'work', 'location', 'other'
  validFrom: Date;
}

/**
 * Build a user profile from stored facts.
 * Static = high importance (>0.7) + old (>7 days)
 * Dynamic = recent (<7 days) OR low importance
 */
export async function getUserProfile(
  storage: StorageAdapter,
  tenantId: string,
  userId: string,
): Promise<UserProfile> {
  const facts = await storage.getFactsByScope(tenantId, 'user', userId, { limit: 100 });
  const validFacts = facts.data.filter(f => f.validUntil === null);

  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  const staticFacts: ProfileFact[] = [];
  const dynamicFacts: ProfileFact[] = [];

  for (const fact of validFacts) {
    // Skip raw chunks — only use extracted facts for profiles
    if (fact.tags?.includes('raw_chunk')) continue;

    const age = now - new Date(fact.validFrom).getTime();
    const category = categorize(fact.content, fact.importance);

    const profileFact: ProfileFact = {
      id: fact.id,
      content: fact.content,
      importance: fact.importance,
      category,
      validFrom: new Date(fact.validFrom),
    };

    if (fact.importance >= 0.7 && age > sevenDays) {
      staticFacts.push(profileFact);
    } else {
      dynamicFacts.push(profileFact);
    }
  }

  // Sort: static by importance desc, dynamic by recency desc
  staticFacts.sort((a, b) => b.importance - a.importance);
  dynamicFacts.sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime());

  return {
    userId,
    static: staticFacts,
    dynamic: dynamicFacts,
    lastUpdated: validFacts.length > 0
      ? new Date(Math.max(...validFacts.map(f => new Date(f.createdAt).getTime())))
      : null,
  };
}

export function categorize(content: string, _importance: number): string {
  const lower = content.toLowerCase();
  if (lower.includes('allergic') || lower.includes('medication') || lower.includes('health')) return 'health';
  if (lower.includes('name is') || lower.includes('age') || lower.includes('born')) return 'identity';
  if (lower.includes('works at') || lower.includes('job') || lower.includes('engineer') || lower.includes('company')) return 'work';
  if (lower.includes('lives in') || lower.includes('based in') || lower.includes('location') || lower.includes('from')) return 'location';
  if (lower.includes('prefers') || lower.includes('likes') || lower.includes('loves') || lower.includes('hates') || lower.includes('favorite')) return 'preference';
  return 'other';
}

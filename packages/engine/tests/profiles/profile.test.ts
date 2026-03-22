import { describe, it, expect } from 'vitest';
import { getUserProfile, categorize } from '../../src/profiles/profile.js';
import type { Fact } from '../../src/models/index.js';
import type { StorageAdapter, PaginatedResult } from '../../src/adapters/storage.js';

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function makeFact(overrides: Partial<Fact> = {}): Fact {
  return {
    id: 'fact-1',
    tenantId: 'tenant-1',
    scope: 'user',
    scopeId: 'user-1',
    sessionId: null,
    content: 'likes TypeScript',
    embeddingModel: 'text-embedding-3-small',
    embeddingDim: 1536,
    version: 1,
    lineageId: 'lineage-1',
    validFrom: new Date('2025-01-01'),
    validUntil: null,
    operation: 'create',
    parentId: null,
    importance: 0.8,
    frequency: 5,
    lastAccessed: new Date('2025-06-01'),
    decayScore: 0.9,
    contradictionStatus: 'none',
    contradictsId: null,
    sourceType: 'conversation',
    sourceRef: null,
    confidence: 0.9,
    originalContent: null,
    extractionId: null,
    extractionTier: null,
    modality: 'text',
    tags: [],
    metadata: {},
    createdAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function mockStorage(facts: Fact[]): StorageAdapter {
  return {
    getFactsByScope: async () => ({
      data: facts,
      cursor: null,
      hasMore: false,
    }) as PaginatedResult<Fact>,
  } as unknown as StorageAdapter;
}

describe('getUserProfile', () => {
  it('returns static facts for high importance and old facts', async () => {
    const facts = [
      makeFact({
        id: 'f1',
        content: 'name is Alice',
        importance: 0.9,
        validFrom: daysAgo(30),
        createdAt: daysAgo(30),
      }),
      makeFact({
        id: 'f2',
        content: 'works at Acme Corp',
        importance: 0.8,
        validFrom: daysAgo(14),
        createdAt: daysAgo(14),
      }),
    ];

    const profile = await getUserProfile(mockStorage(facts), 'tenant-1', 'user-1');

    expect(profile.userId).toBe('user-1');
    expect(profile.static).toHaveLength(2);
    expect(profile.static[0].id).toBe('f1'); // higher importance first
    expect(profile.static[1].id).toBe('f2');
    expect(profile.dynamic).toHaveLength(0);
  });

  it('returns dynamic facts for recent or low importance facts', async () => {
    const facts = [
      // Recent + high importance → dynamic (because recent)
      makeFact({
        id: 'f1',
        content: 'working on project X',
        importance: 0.9,
        validFrom: daysAgo(2),
        createdAt: daysAgo(2),
      }),
      // Old + low importance → dynamic (because low importance)
      makeFact({
        id: 'f2',
        content: 'mentioned coffee',
        importance: 0.4,
        validFrom: daysAgo(30),
        createdAt: daysAgo(30),
      }),
    ];

    const profile = await getUserProfile(mockStorage(facts), 'tenant-1', 'user-1');

    expect(profile.static).toHaveLength(0);
    expect(profile.dynamic).toHaveLength(2);
    // Sorted by recency desc → f1 (2 days ago) before f2 (30 days ago)
    expect(profile.dynamic[0].id).toBe('f1');
    expect(profile.dynamic[1].id).toBe('f2');
  });

  it('skips raw_chunk tagged facts', async () => {
    const facts = [
      makeFact({
        id: 'f1',
        content: 'name is Bob',
        importance: 0.9,
        validFrom: daysAgo(30),
        createdAt: daysAgo(30),
        tags: ['raw_chunk'],
      }),
      makeFact({
        id: 'f2',
        content: 'likes pizza',
        importance: 0.8,
        validFrom: daysAgo(10),
        createdAt: daysAgo(10),
      }),
    ];

    const profile = await getUserProfile(mockStorage(facts), 'tenant-1', 'user-1');

    expect(profile.static).toHaveLength(1);
    expect(profile.static[0].id).toBe('f2');
    expect(profile.dynamic).toHaveLength(0);
  });

  it('skips invalidated facts (validUntil set)', async () => {
    const facts = [
      makeFact({
        id: 'f1',
        content: 'name is Charlie',
        importance: 0.9,
        validFrom: daysAgo(30),
        createdAt: daysAgo(30),
        validUntil: daysAgo(5), // invalidated
      }),
    ];

    const profile = await getUserProfile(mockStorage(facts), 'tenant-1', 'user-1');

    expect(profile.static).toHaveLength(0);
    expect(profile.dynamic).toHaveLength(0);
    expect(profile.lastUpdated).toBeNull();
  });

  it('returns empty profile for no facts', async () => {
    const profile = await getUserProfile(mockStorage([]), 'tenant-1', 'user-1');

    expect(profile.userId).toBe('user-1');
    expect(profile.static).toHaveLength(0);
    expect(profile.dynamic).toHaveLength(0);
    expect(profile.lastUpdated).toBeNull();
  });

  it('sorts static by importance desc, dynamic by recency desc', async () => {
    const facts = [
      // Static facts (high importance, old)
      makeFact({ id: 'low-imp', content: 'works at place A', importance: 0.75, validFrom: daysAgo(20), createdAt: daysAgo(20) }),
      makeFact({ id: 'high-imp', content: 'works at place B', importance: 0.95, validFrom: daysAgo(15), createdAt: daysAgo(15) }),
      // Dynamic facts (recent)
      makeFact({ id: 'older-dyn', content: 'thinking about X', importance: 0.9, validFrom: daysAgo(5), createdAt: daysAgo(5) }),
      makeFact({ id: 'newer-dyn', content: 'mood is great', importance: 0.8, validFrom: daysAgo(1), createdAt: daysAgo(1) }),
    ];

    const profile = await getUserProfile(mockStorage(facts), 'tenant-1', 'user-1');

    expect(profile.static.map(f => f.id)).toEqual(['high-imp', 'low-imp']);
    expect(profile.dynamic.map(f => f.id)).toEqual(['newer-dyn', 'older-dyn']);
  });

  it('sets lastUpdated to the most recent createdAt', async () => {
    const recentDate = daysAgo(1);
    const facts = [
      makeFact({ id: 'f1', importance: 0.9, validFrom: daysAgo(30), createdAt: daysAgo(30) }),
      makeFact({ id: 'f2', importance: 0.5, validFrom: daysAgo(3), createdAt: recentDate }),
    ];

    const profile = await getUserProfile(mockStorage(facts), 'tenant-1', 'user-1');

    expect(profile.lastUpdated).toEqual(recentDate);
  });
});

describe('categorize', () => {
  it('categorizes health-related content', () => {
    expect(categorize('is allergic to peanuts', 0.9)).toBe('health');
    expect(categorize('takes medication daily', 0.8)).toBe('health');
    expect(categorize('health condition: asthma', 0.7)).toBe('health');
  });

  it('categorizes identity-related content', () => {
    expect(categorize('name is Alice', 0.9)).toBe('identity');
    expect(categorize('born in 1990', 0.8)).toBe('identity');
    expect(categorize('age 34', 0.7)).toBe('identity');
  });

  it('categorizes work-related content', () => {
    expect(categorize('works at Google', 0.9)).toBe('work');
    expect(categorize('job title is PM', 0.8)).toBe('work');
    expect(categorize('is a software engineer', 0.7)).toBe('work');
    expect(categorize('company is Acme', 0.7)).toBe('work');
  });

  it('categorizes location-related content', () => {
    expect(categorize('lives in San Francisco', 0.9)).toBe('location');
    expect(categorize('based in London', 0.8)).toBe('location');
    expect(categorize('from New York', 0.7)).toBe('location');
  });

  it('categorizes preference-related content', () => {
    expect(categorize('prefers dark mode', 0.9)).toBe('preference');
    expect(categorize('likes hiking', 0.8)).toBe('preference');
    expect(categorize('loves cooking', 0.7)).toBe('preference');
    expect(categorize('hates spam', 0.6)).toBe('preference');
    expect(categorize('favorite color is blue', 0.5)).toBe('preference');
  });

  it('returns other for unrecognized content', () => {
    expect(categorize('uses TypeScript', 0.8)).toBe('other');
    expect(categorize('bought a new laptop', 0.5)).toBe('other');
  });
});

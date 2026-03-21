import { describe, it, expect } from 'vitest';
import { calculateDecayScore, type DecayInput } from '../../src/salience/decay.js';

const HALF_LIFE_DAYS = 30;
const NORMALIZATION_K = 50;

function msAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

const baseInput: DecayInput = {
  importance: 0.8,
  frequency: 10,
  lastAccessed: msAgo(0),
  halfLifeDays: HALF_LIFE_DAYS,
  normalizationK: NORMALIZATION_K,
};

describe('calculateDecayScore', () => {
  it('returns a positive score for a just-accessed fact', () => {
    const score = calculateDecayScore({ ...baseInput, lastAccessed: msAgo(0) });
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('decays over time: recent > 30 days ago > 60 days ago', () => {
    const recent = calculateDecayScore({ ...baseInput, lastAccessed: msAgo(1) });
    const thirtyDays = calculateDecayScore({ ...baseInput, lastAccessed: msAgo(30) });
    const sixtyDays = calculateDecayScore({ ...baseInput, lastAccessed: msAgo(60) });

    expect(recent).toBeGreaterThan(thirtyDays);
    expect(thirtyDays).toBeGreaterThan(sixtyDays);
  });

  it('higher importance yields higher score at the same recency', () => {
    const lastAccessed = msAgo(10);
    const highImportance = calculateDecayScore({ ...baseInput, importance: 1.0, lastAccessed });
    const lowImportance = calculateDecayScore({ ...baseInput, importance: 0.2, lastAccessed });

    expect(highImportance).toBeGreaterThan(lowImportance);
  });

  it('higher frequency boosts score', () => {
    const lastAccessed = msAgo(10);
    const highFreq = calculateDecayScore({ ...baseInput, frequency: 100, lastAccessed });
    const lowFreq = calculateDecayScore({ ...baseInput, frequency: 1, lastAccessed });

    expect(highFreq).toBeGreaterThan(lowFreq);
  });

  it('frequency factor caps at 1.0 even with frequency=1000', () => {
    const lastAccessed = msAgo(0);
    const veryHighFreq = calculateDecayScore({
      ...baseInput,
      importance: 1.0,
      frequency: 1000,
      lastAccessed,
    });
    const cappedFreq = calculateDecayScore({
      ...baseInput,
      importance: 1.0,
      frequency: 10000,
      lastAccessed,
    });

    // Both should be <= 1
    expect(veryHighFreq).toBeLessThanOrEqual(1);
    expect(cappedFreq).toBeLessThanOrEqual(1);
    // Score should not increase further once frequency factor is capped
    expect(Math.abs(veryHighFreq - cappedFreq)).toBeLessThan(0.01);
  });

  it('returns 0 for null lastAccessed', () => {
    const score = calculateDecayScore({ ...baseInput, lastAccessed: null });
    expect(score).toBe(0);
  });

  describe('score is always between 0 and 1 for extreme inputs', () => {
    it('importance=1, freq=1000, now', () => {
      const score = calculateDecayScore({
        importance: 1,
        frequency: 1000,
        lastAccessed: msAgo(0),
        halfLifeDays: HALF_LIFE_DAYS,
        normalizationK: NORMALIZATION_K,
      });
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('importance=0, freq=0, epoch', () => {
      const score = calculateDecayScore({
        importance: 0,
        frequency: 0,
        lastAccessed: new Date(0),
        halfLifeDays: HALF_LIFE_DAYS,
        normalizationK: NORMALIZATION_K,
      });
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('importance=0.5, freq=5, 1-year-ago', () => {
      const score = calculateDecayScore({
        importance: 0.5,
        frequency: 5,
        lastAccessed: msAgo(365),
        halfLifeDays: HALF_LIFE_DAYS,
        normalizationK: NORMALIZATION_K,
      });
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  it('recency factor is approximately 0.5 at exactly halfLifeDays', () => {
    // With importance=1 and frequency high enough to cap frequencyFactor at ~1,
    // score ≈ recencyFactor at halfLifeDays, which should be ~0.5
    const score = calculateDecayScore({
      importance: 1.0,
      frequency: 1000,         // ensures frequencyFactor ≈ 1
      lastAccessed: msAgo(HALF_LIFE_DAYS),
      halfLifeDays: HALF_LIFE_DAYS,
      normalizationK: NORMALIZATION_K,
    });

    // recencyFactor = exp(-ln2/30 * 30) = exp(-ln2) = 0.5
    // frequencyFactor with freq=1000 and K=50: log(1001)/log(51) ≈ 1.76 → capped to 1.0
    // score ≈ 1.0 * 0.5 * 1.0 = 0.5
    expect(score).toBeCloseTo(0.5, 2);
  });
});

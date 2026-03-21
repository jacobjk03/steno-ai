import { describe, it, expect } from 'vitest';
import { processContradictions } from '../../src/extraction/contradiction.js';
import type { ExtractedFact } from '../../src/extraction/types.js';

function makeFact(overrides: Partial<ExtractedFact> = {}): ExtractedFact {
  return {
    content: 'The user likes cats',
    importance: 0.8,
    confidence: 0.9,
    sourceType: 'conversation',
    modality: 'text',
    tags: ['preference'],
    originalContent: 'I really like cats',
    ...overrides,
  };
}

describe('processContradictions', () => {
  it('marks a fact with operation=contradict and contradictsFactId as active', () => {
    const fact = makeFact({
      operation: 'contradict',
      contradictsFactId: 'fact-123',
    });
    const results = processContradictions([fact]);
    expect(results).toHaveLength(1);
    expect(results[0].contradictionStatus).toBe('active');
    expect(results[0].contradictsId).toBe('fact-123');
  });

  it('marks a fact with operation=contradict but NO contradictsFactId as none', () => {
    const fact = makeFact({ operation: 'contradict' });
    // contradictsFactId is intentionally absent
    const results = processContradictions([fact]);
    expect(results).toHaveLength(1);
    expect(results[0].contradictionStatus).toBe('none');
    expect(results[0].contradictsId).toBeNull();
  });

  it('marks a fact with operation=add as none with null contradictsId', () => {
    const fact = makeFact({ operation: 'add' });
    const results = processContradictions([fact]);
    expect(results).toHaveLength(1);
    expect(results[0].contradictionStatus).toBe('none');
    expect(results[0].contradictsId).toBeNull();
  });

  it('marks a fact with operation=update as none', () => {
    const fact = makeFact({ operation: 'update', existingLineageId: 'lineage-456' });
    const results = processContradictions([fact]);
    expect(results).toHaveLength(1);
    expect(results[0].contradictionStatus).toBe('none');
    expect(results[0].contradictsId).toBeNull();
  });

  it('marks a fact with operation=noop as none', () => {
    const fact = makeFact({ operation: 'noop' });
    const results = processContradictions([fact]);
    expect(results).toHaveLength(1);
    expect(results[0].contradictionStatus).toBe('none');
    expect(results[0].contradictsId).toBeNull();
  });

  it('marks a fact with operation=undefined as none', () => {
    const fact = makeFact();
    // operation is not set
    const results = processContradictions([fact]);
    expect(results).toHaveLength(1);
    expect(results[0].contradictionStatus).toBe('none');
    expect(results[0].contradictsId).toBeNull();
  });

  it('processes multiple facts independently', () => {
    const facts: ExtractedFact[] = [
      makeFact({ content: 'Fact A', operation: 'add' }),
      makeFact({ content: 'Fact B', operation: 'contradict', contradictsFactId: 'fact-111' }),
      makeFact({ content: 'Fact C', operation: 'noop' }),
      makeFact({ content: 'Fact D', operation: 'contradict', contradictsFactId: 'fact-222' }),
    ];
    const results = processContradictions(facts);
    expect(results).toHaveLength(4);

    expect(results[0].contradictionStatus).toBe('none');
    expect(results[0].contradictsId).toBeNull();

    expect(results[1].contradictionStatus).toBe('active');
    expect(results[1].contradictsId).toBe('fact-111');

    expect(results[2].contradictionStatus).toBe('none');
    expect(results[2].contradictsId).toBeNull();

    expect(results[3].contradictionStatus).toBe('active');
    expect(results[3].contradictsId).toBe('fact-222');
  });

  it('returns an empty array when given an empty array', () => {
    const results = processContradictions([]);
    expect(results).toEqual([]);
  });

  it('preserves the original fact object in the result', () => {
    const fact = makeFact({
      content: 'The sky is green',
      importance: 0.5,
      confidence: 0.7,
      tags: ['color', 'sky'],
      originalContent: 'Wait, the sky is green now?',
      operation: 'contradict',
      contradictsFactId: 'fact-sky-blue',
    });
    const results = processContradictions([fact]);
    expect(results[0].fact).toBe(fact);
    expect(results[0].fact.content).toBe('The sky is green');
    expect(results[0].fact.importance).toBe(0.5);
    expect(results[0].fact.confidence).toBe(0.7);
    expect(results[0].fact.tags).toEqual(['color', 'sky']);
    expect(results[0].fact.originalContent).toBe('Wait, the sky is green now?');
  });

  it('preserves the original fact object for non-contradiction facts too', () => {
    const fact = makeFact({
      content: 'User prefers dark mode',
      importance: 0.6,
      tags: ['ui', 'preference'],
      operation: 'add',
    });
    const results = processContradictions([fact]);
    expect(results[0].fact).toBe(fact);
    expect(results[0].fact.content).toBe('User prefers dark mode');
    expect(results[0].fact.importance).toBe(0.6);
    expect(results[0].fact.tags).toEqual(['ui', 'preference']);
  });

  it('marks operation=invalidate as none (not a contradiction)', () => {
    const fact = makeFact({ operation: 'invalidate' });
    const results = processContradictions([fact]);
    expect(results[0].contradictionStatus).toBe('none');
    expect(results[0].contradictsId).toBeNull();
  });
});

import { describe, it, expect, vi } from 'vitest';
import type { LLMAdapter, LLMMessage, LLMResponse } from '../../src/adapters/llm.js';
import { extractWithLLM } from '../../src/extraction/llm-extractor.js';

// ---------------------------------------------------------------------------
// Mock LLMAdapter
// ---------------------------------------------------------------------------

class MockLLMAdapter implements LLMAdapter {
  readonly model = 'mock-model';
  private response: string;
  constructor(response: string) {
    this.response = response;
  }
  async complete(_messages: LLMMessage[]): Promise<LLMResponse> {
    return { content: this.response, tokensInput: 10, tokensOutput: 20, model: 'mock-model' };
  }
}

class ThrowingLLMAdapter implements LLMAdapter {
  readonly model = 'mock-model';
  async complete(_messages: LLMMessage[]): Promise<LLMResponse> {
    throw new Error('LLM API error');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const validResponse = JSON.stringify({
  facts: [
    {
      content: 'User prefers dark mode',
      importance: 0.6,
      operation: 'add',
      existing_lineage_id: null,
      contradicts_fact_id: null,
      entities: [{ name: 'User', type: 'person' }],
      relationships: [
        { source: 'User', target: 'dark mode', relation: 'prefers', edge_type: 'associative' },
      ],
    },
    {
      content: 'User works at Acme Corp',
      importance: 0.8,
      operation: 'add',
      existing_lineage_id: null,
      contradicts_fact_id: null,
      entities: [
        { name: 'Acme Corp', type: 'organization' },
      ],
      relationships: [
        { source: 'user', target: 'acme corp', relation: 'works at', edge_type: 'associative' },
      ],
    },
  ],
  confidence: 0.85,
  entities: [],
  edges: [],
});

// ---------------------------------------------------------------------------
// Basic extraction
// ---------------------------------------------------------------------------

describe('extractWithLLM – basic extraction', () => {
  it('extracts facts from valid JSON response', async () => {
    const adapter = new MockLLMAdapter(validResponse);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.facts).toHaveLength(2);
    expect(result.facts[0].content).toBe('User prefers dark mode');
    expect(result.facts[1].content).toBe('User works at Acme Corp');
  });

  it('uses "conversation" as sourceType for all facts', async () => {
    const adapter = new MockLLMAdapter(validResponse);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    for (const fact of result.facts) {
      expect(fact.sourceType).toBe('conversation');
    }
  });

  it('uses "text" as modality for all facts', async () => {
    const adapter = new MockLLMAdapter(validResponse);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    for (const fact of result.facts) {
      expect(fact.modality).toBe('text');
    }
  });

  it('sets confidence from top-level confidence field', async () => {
    const adapter = new MockLLMAdapter(validResponse);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.confidence).toBe(0.85);
    for (const fact of result.facts) {
      expect(fact.confidence).toBe(0.85);
    }
  });

  it('sets importance from each fact', async () => {
    const adapter = new MockLLMAdapter(validResponse);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.facts[0].importance).toBe(0.6);
    expect(result.facts[1].importance).toBe(0.8);
  });

  it('sets tags to empty array for each fact', async () => {
    const adapter = new MockLLMAdapter(validResponse);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    for (const fact of result.facts) {
      expect(Array.isArray(fact.tags)).toBe(true);
    }
  });

  it('sets originalContent to the input string', async () => {
    const input = 'User input text here';
    const adapter = new MockLLMAdapter(validResponse);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, input);
    for (const fact of result.facts) {
      expect(fact.originalContent).toBe(input);
    }
  });
});

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

describe('extractWithLLM – entities', () => {
  it('extracts entities from facts', async () => {
    const adapter = new MockLLMAdapter(validResponse);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.entities.length).toBeGreaterThan(0);
  });

  it('entity canonical names are lowercase', async () => {
    const adapter = new MockLLMAdapter(validResponse);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    for (const entity of result.entities) {
      expect(entity.canonicalName).toBe(entity.canonicalName.toLowerCase());
    }
  });

  it('deduplicates entities by canonical name', async () => {
    const responseWithDuplicates = JSON.stringify({
      facts: [
        {
          content: 'User likes cats',
          importance: 0.5,
          entities: [{ name: 'User', type: 'person' }, { name: 'USER', type: 'person' }],
          relationships: [],
        },
        {
          content: 'User loves dogs',
          importance: 0.5,
          entities: [{ name: 'User', type: 'person' }],
          relationships: [],
        },
      ],
      confidence: 0.8,
    });
    const adapter = new MockLLMAdapter(responseWithDuplicates);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    const userEntities = result.entities.filter((e) => e.canonicalName === 'user');
    expect(userEntities).toHaveLength(1);
  });

  it('entity has entityType from LLM response', async () => {
    const adapter = new MockLLMAdapter(validResponse);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    const orgEntity = result.entities.find((e) => e.canonicalName === 'acme corp');
    expect(orgEntity?.entityType).toBe('organization');
  });
});

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

describe('extractWithLLM – edges', () => {
  it('extracts edges/relationships from facts', async () => {
    const adapter = new MockLLMAdapter(validResponse);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.edges.length).toBeGreaterThan(0);
  });

  it('edge sourceName and targetName are lowercase', async () => {
    const adapter = new MockLLMAdapter(validResponse);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    for (const edge of result.edges) {
      expect(edge.sourceName).toBe(edge.sourceName.toLowerCase());
      expect(edge.targetName).toBe(edge.targetName.toLowerCase());
    }
  });

  it('invalid edge_type defaults to "associative"', async () => {
    const responseWithInvalidEdge = JSON.stringify({
      facts: [
        {
          content: 'User likes pizza',
          importance: 0.5,
          entities: [],
          relationships: [
            { source: 'user', target: 'pizza', relation: 'likes', edge_type: 'unknown_type' },
          ],
        },
      ],
      confidence: 0.7,
    });
    const adapter = new MockLLMAdapter(responseWithInvalidEdge);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.edges[0].edgeType).toBe('associative');
  });

  it('valid edge_type is preserved', async () => {
    const responseWithCausal = JSON.stringify({
      facts: [
        {
          content: 'Smoking causes cancer',
          importance: 0.9,
          entities: [],
          relationships: [
            { source: 'smoking', target: 'cancer', relation: 'causes', edge_type: 'causal' },
          ],
        },
      ],
      confidence: 0.9,
    });
    const adapter = new MockLLMAdapter(responseWithCausal);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.edges[0].edgeType).toBe('causal');
  });
});

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

describe('extractWithLLM – operations', () => {
  it('valid operation is preserved', async () => {
    const adapter = new MockLLMAdapter(validResponse);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.facts[0].operation).toBe('add');
  });

  it('invalid operation is set to undefined', async () => {
    const responseWithInvalidOp = JSON.stringify({
      facts: [
        {
          content: 'User prefers light mode',
          importance: 0.6,
          operation: 'create', // invalid operation
          entities: [],
          relationships: [],
        },
      ],
      confidence: 0.8,
    });
    const adapter = new MockLLMAdapter(responseWithInvalidOp);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.facts[0].operation).toBeUndefined();
  });

  it('sets existingLineageId from existing_lineage_id', async () => {
    const responseWithLineage = JSON.stringify({
      facts: [
        {
          content: 'User now prefers dark mode',
          importance: 0.6,
          operation: 'update',
          existing_lineage_id: 'lin-abc',
          contradicts_fact_id: null,
          entities: [],
          relationships: [],
        },
      ],
      confidence: 0.8,
    });
    const adapter = new MockLLMAdapter(responseWithLineage);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.facts[0].existingLineageId).toBe('lin-abc');
  });

  it('sets contradictsFactId from contradicts_fact_id', async () => {
    const responseWithContradict = JSON.stringify({
      facts: [
        {
          content: 'User prefers light mode',
          importance: 0.6,
          operation: 'contradict',
          existing_lineage_id: null,
          contradicts_fact_id: 'fact-xyz',
          entities: [],
          relationships: [],
        },
      ],
      confidence: 0.8,
    });
    const adapter = new MockLLMAdapter(responseWithContradict);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.facts[0].contradictsFactId).toBe('fact-xyz');
  });
});

// ---------------------------------------------------------------------------
// Importance clamping
// ---------------------------------------------------------------------------

describe('extractWithLLM – importance clamping', () => {
  it('clamps importance above 1 to 1', async () => {
    const responseWithHighImportance = JSON.stringify({
      facts: [{ content: 'User is important', importance: 1.5, entities: [], relationships: [] }],
      confidence: 0.8,
    });
    const adapter = new MockLLMAdapter(responseWithHighImportance);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.facts[0].importance).toBe(1);
  });

  it('clamps importance below 0 to 0', async () => {
    const responseWithNegImportance = JSON.stringify({
      facts: [{ content: 'User is here', importance: -0.5, entities: [], relationships: [] }],
      confidence: 0.8,
    });
    const adapter = new MockLLMAdapter(responseWithNegImportance);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.facts[0].importance).toBe(0);
  });

  it('defaults importance to 0.5 when missing', async () => {
    const responseNoImportance = JSON.stringify({
      facts: [{ content: 'User is here', entities: [], relationships: [] }],
      confidence: 0.8,
    });
    const adapter = new MockLLMAdapter(responseNoImportance);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.facts[0].importance).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Empty/missing facts
// ---------------------------------------------------------------------------

describe('extractWithLLM – empty/missing facts', () => {
  it('handles empty facts array', async () => {
    const emptyResponse = JSON.stringify({ facts: [], confidence: 0.8 });
    const adapter = new MockLLMAdapter(emptyResponse);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.facts).toHaveLength(0);
    expect(result.entities).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it('ignores facts with empty content', async () => {
    const responseWithEmpty = JSON.stringify({
      facts: [
        { content: '', importance: 0.5, entities: [], relationships: [] },
        { content: '   ', importance: 0.5, entities: [], relationships: [] },
        { content: 'User likes cats', importance: 0.5, entities: [], relationships: [] },
      ],
      confidence: 0.8,
    });
    const adapter = new MockLLMAdapter(responseWithEmpty);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0].content).toBe('User likes cats');
  });

  it('ignores facts with missing content field', async () => {
    const responseWithMissing = JSON.stringify({
      facts: [
        { importance: 0.5, entities: [], relationships: [] },
        { content: 'Valid fact', importance: 0.5, entities: [], relationships: [] },
      ],
      confidence: 0.8,
    });
    const adapter = new MockLLMAdapter(responseWithMissing);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.facts).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Token usage and metadata
// ---------------------------------------------------------------------------

describe('extractWithLLM – metadata', () => {
  it('reports correct token usage from LLM response', async () => {
    const adapter = new MockLLMAdapter(validResponse);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.tokensInput).toBe(10);
    expect(result.tokensOutput).toBe(20);
  });

  it('reports model from LLM response', async () => {
    const adapter = new MockLLMAdapter(validResponse);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.model).toBe('mock-model');
  });

  it('sets tier correctly for cheap_llm', async () => {
    const adapter = new MockLLMAdapter(validResponse);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.tier).toBe('cheap_llm');
  });

  it('sets tier correctly for smart_llm', async () => {
    const adapter = new MockLLMAdapter(validResponse);
    const result = await extractWithLLM({ llm: adapter, tier: 'smart_llm' }, 'some input');
    expect(result.tier).toBe('smart_llm');
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('extractWithLLM – error handling', () => {
  it('handles LLM API error (empty result, no crash)', async () => {
    const adapter = new ThrowingLLMAdapter();
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.facts).toHaveLength(0);
    expect(result.entities).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
    expect(result.confidence).toBe(0);
  });

  it('handles malformed JSON — returns empty result after retry', async () => {
    const adapter = new MockLLMAdapter('this is not JSON {{{');
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.facts).toHaveLength(0);
    expect(result.entities).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it('handles LLM API error — tokensInput is 0', async () => {
    const adapter = new ThrowingLLMAdapter();
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.tokensInput).toBe(0);
    expect(result.tokensOutput).toBe(0);
  });

  it('handles missing facts field gracefully (non-array)', async () => {
    const responseNoFacts = JSON.stringify({ confidence: 0.8 });
    const adapter = new MockLLMAdapter(responseNoFacts);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.facts).toHaveLength(0);
  });

  it('handles facts field being a non-array gracefully', async () => {
    const responseBadFacts = JSON.stringify({ facts: 'not an array', confidence: 0.8 });
    const adapter = new MockLLMAdapter(responseBadFacts);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.facts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// existingFacts — passed to prompt builder
// ---------------------------------------------------------------------------

describe('extractWithLLM – existingFacts passed to prompt builder', () => {
  it('passes existingFacts to prompt builder (visible in user message)', async () => {
    let capturedMessages: LLMMessage[] | null = null;
    const capturingAdapter: LLMAdapter = {
      model: 'capture-model',
      async complete(messages: LLMMessage[]): Promise<LLMResponse> {
        capturedMessages = messages;
        return { content: JSON.stringify({ facts: [], confidence: 0.8 }), tokensInput: 5, tokensOutput: 5, model: 'capture-model' };
      },
    };

    const existingFacts = [
      { lineageId: 'lid-001', content: 'User prefers dark mode' },
      { lineageId: 'lid-002', content: 'User works at Acme' },
    ];

    await extractWithLLM({ llm: capturingAdapter, tier: 'cheap_llm' }, 'New input text', existingFacts);

    expect(capturedMessages).not.toBeNull();
    const userMessage = capturedMessages![1];
    expect(userMessage.content).toContain('EXISTING FACTS');
    expect(userMessage.content).toContain('lid-001');
    expect(userMessage.content).toContain('lid-002');
    expect(userMessage.content).toContain('User prefers dark mode');
  });

  it('works without existingFacts (undefined)', async () => {
    const adapter = new MockLLMAdapter(JSON.stringify({ facts: [], confidence: 0.8 }));
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.facts).toHaveLength(0);
  });

  it('works with empty existingFacts array', async () => {
    let capturedMessages: LLMMessage[] | null = null;
    const capturingAdapter: LLMAdapter = {
      model: 'capture-model',
      async complete(messages: LLMMessage[]): Promise<LLMResponse> {
        capturedMessages = messages;
        return { content: JSON.stringify({ facts: [], confidence: 0.8 }), tokensInput: 5, tokensOutput: 5, model: 'capture-model' };
      },
    };

    await extractWithLLM({ llm: capturingAdapter, tier: 'cheap_llm' }, 'New input text', []);

    const userMessage = capturedMessages![1];
    expect(userMessage.content).not.toContain('EXISTING FACTS');
  });
});

// ---------------------------------------------------------------------------
// Default confidence when missing
// ---------------------------------------------------------------------------

describe('extractWithLLM – default confidence', () => {
  it('defaults confidence to 0.7 when not a number', async () => {
    const responseNoConf = JSON.stringify({
      facts: [{ content: 'User likes tea', importance: 0.5, entities: [], relationships: [] }],
    });
    const adapter = new MockLLMAdapter(responseNoConf);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.confidence).toBe(0.7);
    expect(result.facts[0].confidence).toBe(0.7);
  });
});

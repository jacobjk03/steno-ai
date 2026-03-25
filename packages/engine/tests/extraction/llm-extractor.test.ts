import { describe, it, expect, vi } from 'vitest';
import type { LLMAdapter, LLMMessage, LLMResponse } from '../../src/adapters/llm.js';
import { extractWithLLM } from '../../src/extraction/llm-extractor.js';

// ---------------------------------------------------------------------------
// Mock LLMAdapter — supports two-pass extraction
// ---------------------------------------------------------------------------

/**
 * The new two-pass architecture makes two LLM calls:
 * 1. Fact extraction → returns {"facts": ["string1", "string2"]}
 * 2. Graph extraction → returns {"entities": [...], "edges": [...]}
 *
 * TwoPassMockLLM responds with different payloads for each call.
 */
class TwoPassMockLLM implements LLMAdapter {
  readonly model = 'mock-model';
  private callCount = 0;
  private pass1Response: string;
  private pass2Response: string;

  constructor(pass1Response: string, pass2Response?: string) {
    this.pass1Response = pass1Response;
    this.pass2Response = pass2Response ?? JSON.stringify({ entities: [], edges: [] });
  }

  async complete(_messages: LLMMessage[]): Promise<LLMResponse> {
    this.callCount++;
    const content = this.callCount === 1 ? this.pass1Response : this.pass2Response;
    return { content, tokensInput: 10, tokensOutput: 20, model: 'mock-model' };
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

const validPass1 = JSON.stringify({
  facts: [
    { t: 'User prefers dark mode', i: 0.6 },
    { t: 'User works at Acme Corp', i: 0.8 },
  ],
});

const validPass2 = JSON.stringify({
  entities: [
    { name: 'User', entity_type: 'person' },
    { name: 'Acme Corp', entity_type: 'organization' },
  ],
  edges: [
    { source: 'user', target: 'acme corp', relation: 'works_at' },
  ],
});

// ---------------------------------------------------------------------------
// Basic extraction (two-pass)
// ---------------------------------------------------------------------------

describe('extractWithLLM – basic extraction', () => {
  it('extracts facts from valid JSON response', async () => {
    const adapter = new TwoPassMockLLM(validPass1, validPass2);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.facts).toHaveLength(2);
    expect(result.facts[0].content).toBe('User prefers dark mode');
    expect(result.facts[1].content).toBe('User works at Acme Corp');
  });

  it('uses "conversation" as sourceType for all facts', async () => {
    const adapter = new TwoPassMockLLM(validPass1, validPass2);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    for (const fact of result.facts) {
      expect(fact.sourceType).toBe('conversation');
    }
  });

  it('uses "text" as modality for all facts', async () => {
    const adapter = new TwoPassMockLLM(validPass1, validPass2);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    for (const fact of result.facts) {
      expect(fact.modality).toBe('text');
    }
  });

  it('sets confidence to 0.8 (hardcoded in two-pass mode)', async () => {
    const adapter = new TwoPassMockLLM(validPass1, validPass2);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.confidence).toBe(0.8);
    for (const fact of result.facts) {
      expect(fact.confidence).toBe(0.8);
    }
  });

  it('sets importance from LLM-scored values', async () => {
    const adapter = new TwoPassMockLLM(validPass1, validPass2);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.facts[0].importance).toBe(0.6);
    expect(result.facts[1].importance).toBe(0.8);
  });

  it('sets tags to empty array for each fact', async () => {
    const adapter = new TwoPassMockLLM(validPass1, validPass2);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    for (const fact of result.facts) {
      expect(Array.isArray(fact.tags)).toBe(true);
    }
  });

  it('sets originalContent to the input string', async () => {
    const input = 'User input text here';
    const adapter = new TwoPassMockLLM(validPass1, validPass2);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, input);
    for (const fact of result.facts) {
      expect(fact.originalContent).toBe(input);
    }
  });
});

// ---------------------------------------------------------------------------
// Entities (from Pass 2)
// ---------------------------------------------------------------------------

describe('extractWithLLM – entities', () => {
  it('extracts entities from Pass 2 response', async () => {
    const adapter = new TwoPassMockLLM(validPass1, validPass2);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.entities.length).toBeGreaterThan(0);
  });

  it('entity canonical names are lowercase', async () => {
    const adapter = new TwoPassMockLLM(validPass1, validPass2);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    for (const entity of result.entities) {
      expect(entity.canonicalName).toBe(entity.canonicalName.toLowerCase());
    }
  });

  it('deduplicates entities by canonical name', async () => {
    const pass2WithDuplicates = JSON.stringify({
      entities: [
        { name: 'User', entity_type: 'person' },
        { name: 'USER', entity_type: 'person' },
        { name: 'user', entity_type: 'person' },
      ],
      edges: [],
    });
    const adapter = new TwoPassMockLLM(validPass1, pass2WithDuplicates);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    const userEntities = result.entities.filter((e) => e.canonicalName === 'user');
    expect(userEntities).toHaveLength(1);
  });

  it('entity has entityType from LLM response', async () => {
    const adapter = new TwoPassMockLLM(validPass1, validPass2);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    const orgEntity = result.entities.find((e) => e.canonicalName === 'acme corp');
    expect(orgEntity?.entityType).toBe('organization');
  });
});

// ---------------------------------------------------------------------------
// Edges (from Pass 2)
// ---------------------------------------------------------------------------

describe('extractWithLLM – edges', () => {
  it('extracts edges from Pass 2 response', async () => {
    const adapter = new TwoPassMockLLM(validPass1, validPass2);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.edges.length).toBeGreaterThan(0);
  });

  it('edge sourceName and targetName are lowercase', async () => {
    const adapter = new TwoPassMockLLM(validPass1, validPass2);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    for (const edge of result.edges) {
      expect(edge.sourceName).toBe(edge.sourceName.toLowerCase());
      expect(edge.targetName).toBe(edge.targetName.toLowerCase());
    }
  });

  it('invalid edge_type defaults to "associative"', async () => {
    const pass2 = JSON.stringify({
      entities: [{ name: 'User', entity_type: 'person' }, { name: 'Pizza', entity_type: 'concept' }],
      edges: [{ source: 'user', target: 'pizza', relation: 'likes', edge_type: 'unknown_type' }],
    });
    const adapter = new TwoPassMockLLM(validPass1, pass2);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.edges[0].edgeType).toBe('associative');
  });

  it('valid edge_type is preserved', async () => {
    const pass2 = JSON.stringify({
      entities: [{ name: 'Smoking', entity_type: 'concept' }, { name: 'Cancer', entity_type: 'concept' }],
      edges: [{ source: 'smoking', target: 'cancer', relation: 'causes', edge_type: 'causal' }],
    });
    const adapter = new TwoPassMockLLM(validPass1, pass2);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.edges[0].edgeType).toBe('causal');
  });
});

// ---------------------------------------------------------------------------
// Empty/missing facts
// ---------------------------------------------------------------------------

describe('extractWithLLM – empty/missing facts', () => {
  it('handles empty facts array', async () => {
    const adapter = new TwoPassMockLLM(JSON.stringify({ facts: [] }));
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.facts).toHaveLength(0);
    expect(result.entities).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it('handles mixed formats: objects with t/i, plain strings, and invalid values', async () => {
    const response = JSON.stringify({
      facts: [
        { t: 'Object fact with importance', i: 0.9 },
        'Valid string fact',
        42,
        null,
        { text: 'Alt format fact', importance: 0.7 },
      ],
    });
    const adapter = new TwoPassMockLLM(response);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.facts).toHaveLength(3);
    expect(result.facts[0].content).toBe('Object fact with importance');
    expect(result.facts[0].importance).toBe(0.9);
    expect(result.facts[1].content).toBe('Valid string fact');
    expect(result.facts[1].importance).toBe(0.5);
    expect(result.facts[2].content).toBe('Alt format fact');
    expect(result.facts[2].importance).toBe(0.7);
  });

  it('ignores empty string facts and empty object facts', async () => {
    const response = JSON.stringify({
      facts: ['', '   ', { t: '', i: 0.5 }, { t: 'User likes cats', i: 0.6 }],
    });
    const adapter = new TwoPassMockLLM(response);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0].content).toBe('User likes cats');
  });
});

// ---------------------------------------------------------------------------
// Token usage and metadata
// ---------------------------------------------------------------------------

describe('extractWithLLM – metadata', () => {
  it('accumulates token usage from both passes', async () => {
    const adapter = new TwoPassMockLLM(validPass1, validPass2);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    // Each pass returns tokensInput: 10, tokensOutput: 20
    expect(result.tokensInput).toBe(20);
    expect(result.tokensOutput).toBe(40);
  });

  it('reports model from LLM adapter', async () => {
    const adapter = new TwoPassMockLLM(validPass1, validPass2);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.model).toBe('mock-model');
  });

  it('sets tier correctly for cheap_llm', async () => {
    const adapter = new TwoPassMockLLM(validPass1, validPass2);
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.tier).toBe('cheap_llm');
  });

  it('sets tier correctly for smart_llm', async () => {
    const adapter = new TwoPassMockLLM(validPass1, validPass2);
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

  it('handles malformed JSON — returns empty result', async () => {
    const adapter = new TwoPassMockLLM('this is not JSON {{{');
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
    const adapter = new TwoPassMockLLM(JSON.stringify({ confidence: 0.8 }));
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.facts).toHaveLength(0);
  });

  it('handles facts field being a non-array gracefully', async () => {
    const adapter = new TwoPassMockLLM(JSON.stringify({ facts: 'not an array' }));
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.facts).toHaveLength(0);
  });

  it('still returns facts when Pass 2 (graph) fails', async () => {
    const adapter = new TwoPassMockLLM(validPass1, 'invalid json for graph');
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.facts).toHaveLength(2);
    expect(result.entities).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// existingFacts — appended to Pass 1 prompt
// ---------------------------------------------------------------------------

describe('extractWithLLM – existingFacts passed to prompt builder', () => {
  it('passes existingFacts to Pass 1 prompt (visible in user message)', async () => {
    let capturedMessages: LLMMessage[] | null = null;
    const capturingAdapter: LLMAdapter = {
      model: 'capture-model',
      async complete(messages: LLMMessage[]): Promise<LLMResponse> {
        if (!capturedMessages) capturedMessages = messages; // capture first call (Pass 1)
        return { content: JSON.stringify({ facts: [] }), tokensInput: 5, tokensOutput: 5, model: 'capture-model' };
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
    const adapter = new TwoPassMockLLM(JSON.stringify({ facts: [] }));
    const result = await extractWithLLM({ llm: adapter, tier: 'cheap_llm' }, 'some input');
    expect(result.facts).toHaveLength(0);
  });

  it('works with empty existingFacts array', async () => {
    let capturedMessages: LLMMessage[] | null = null;
    const capturingAdapter: LLMAdapter = {
      model: 'capture-model',
      async complete(messages: LLMMessage[]): Promise<LLMResponse> {
        if (!capturedMessages) capturedMessages = messages;
        return { content: JSON.stringify({ facts: [] }), tokensInput: 5, tokensOutput: 5, model: 'capture-model' };
      },
    };

    await extractWithLLM({ llm: capturingAdapter, tier: 'cheap_llm' }, 'New input text', []);

    const userMessage = capturedMessages![1];
    expect(userMessage.content).not.toContain('EXISTING FACTS');
  });
});

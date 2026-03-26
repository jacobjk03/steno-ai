import { describe, it, expect } from 'vitest';
import {
  FACT_EXTRACTION_PROMPT,
  GRAPH_EXTRACTION_PROMPT,
  DEDUP_PROMPT,
  EXTRACTION_SYSTEM_PROMPT,
  buildExtractionPrompt,
  buildFactExtractionPrompt,
  buildGraphExtractionPrompt,
  buildDedupPrompt,
} from '../../src/extraction/prompts.js';

describe('FACT_EXTRACTION_PROMPT', () => {
  it('is aliased as EXTRACTION_SYSTEM_PROMPT for backward compat', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toBe(FACT_EXTRACTION_PROMPT);
  });

  it('contains WHO IS USER section', () => {
    expect(FACT_EXTRACTION_PROMPT).toContain('WHO IS "USER"');
  });

  it('contains self-contained atomic facts instruction', () => {
    expect(FACT_EXTRACTION_PROMPT).toContain('SELF-CONTAINED atomic facts');
  });

  it('contains JSON output format', () => {
    expect(FACT_EXTRACTION_PROMPT).toContain('JSON');
    expect(FACT_EXTRACTION_PROMPT).toContain('"facts"');
  });

  it('contains resolve references instruction', () => {
    expect(FACT_EXTRACTION_PROMPT).toContain('Resolve ALL other references');
  });

  it('contains third person instruction', () => {
    expect(FACT_EXTRACTION_PROMPT).toContain('third person');
  });

  it('contains direct identity/trait instruction', () => {
    expect(FACT_EXTRACTION_PROMPT).toContain('state them DIRECTLY');
  });

  it('contains person role identification', () => {
    expect(FACT_EXTRACTION_PROMPT).toContain('person');
  });
});

describe('GRAPH_EXTRACTION_PROMPT', () => {
  it('contains entity type: organization', () => {
    expect(GRAPH_EXTRACTION_PROMPT).toContain('organization');
  });

  it('contains entity type: person', () => {
    expect(GRAPH_EXTRACTION_PROMPT).toContain('person');
  });

  it('contains entity type placeholder', () => {
    expect(GRAPH_EXTRACTION_PROMPT).toContain('{ENTITY_TYPES}');
  });

  it('default entity types include location and technology', () => {
    const built = buildGraphExtractionPrompt(['test fact']);
    expect(built[0].content).toContain('location');
    expect(built[0].content).toContain('technology');
  });

  it('contains snake_case relation instruction', () => {
    expect(GRAPH_EXTRACTION_PROMPT).toContain('snake_case');
  });

  it('contains entity_type field in example', () => {
    expect(GRAPH_EXTRACTION_PROMPT).toContain('entity_type');
  });

  it('contains edges array in output format', () => {
    expect(GRAPH_EXTRACTION_PROMPT).toContain('"edges"');
  });
});

describe('DEDUP_PROMPT', () => {
  it('contains ADD operation', () => {
    expect(DEDUP_PROMPT).toContain('ADD');
  });

  it('contains UPDATE operation', () => {
    expect(DEDUP_PROMPT).toContain('UPDATE');
  });

  it('contains NOOP operation', () => {
    expect(DEDUP_PROMPT).toContain('NOOP');
  });

  it('contains CONTRADICT operation', () => {
    expect(DEDUP_PROMPT).toContain('CONTRADICT');
  });
});

describe('buildExtractionPrompt (legacy)', () => {
  it('returns an array with system and user messages', () => {
    const messages = buildExtractionPrompt('Test input text');
    expect(messages).toHaveLength(2);
  });

  it('first message has role system', () => {
    const messages = buildExtractionPrompt('Test input text');
    expect(messages[0].role).toBe('system');
  });

  it('second message has role user', () => {
    const messages = buildExtractionPrompt('Test input text');
    expect(messages[1].role).toBe('user');
  });

  it('user message contains the input text', () => {
    const input = 'My name is Alice and I love coffee';
    const messages = buildExtractionPrompt(input);
    expect(messages[1].content).toContain(input);
  });

  it('system message content equals FACT_EXTRACTION_PROMPT', () => {
    const messages = buildExtractionPrompt('some text');
    expect(messages[0].content).toBe(FACT_EXTRACTION_PROMPT);
  });

  it('without existingFacts, user message does NOT contain EXISTING FACTS', () => {
    const messages = buildExtractionPrompt('some text');
    expect(messages[1].content).not.toContain('EXISTING FACTS');
  });

  it('with existingFacts, user message contains EXISTING FACTS section', () => {
    const existingFacts = [
      { lineage_id: 'lid-001', content: 'User prefers dark mode' },
    ];
    const messages = buildExtractionPrompt('New input', existingFacts);
    expect(messages[1].content).toContain('EXISTING FACTS');
  });

  it('with existingFacts, each fact lineage_id appears in user message', () => {
    const existingFacts = [
      { lineage_id: 'lid-abc', content: 'User likes cats' },
      { lineage_id: 'lid-xyz', content: 'User works at ACME' },
    ];
    const messages = buildExtractionPrompt('New text', existingFacts);
    expect(messages[1].content).toContain('lid-abc');
    expect(messages[1].content).toContain('lid-xyz');
  });

  it('with existingFacts, each fact content appears in user message', () => {
    const existingFacts = [
      { lineage_id: 'lid-001', content: 'User prefers Python over JavaScript' },
    ];
    const messages = buildExtractionPrompt('New text', existingFacts);
    expect(messages[1].content).toContain('User prefers Python over JavaScript');
  });

  it('with empty existingFacts array, user message does NOT contain EXISTING FACTS', () => {
    const messages = buildExtractionPrompt('some text', []);
    expect(messages[1].content).not.toContain('EXISTING FACTS');
  });
});

describe('buildFactExtractionPrompt', () => {
  it('returns system + user messages', () => {
    const messages = buildFactExtractionPrompt('Test input');
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });

  it('system prompt is FACT_EXTRACTION_PROMPT', () => {
    const messages = buildFactExtractionPrompt('Test input');
    expect(messages[0].content).toBe(FACT_EXTRACTION_PROMPT);
  });

  it('user message contains input text', () => {
    const messages = buildFactExtractionPrompt('My name is Alice');
    expect(messages[1].content).toContain('My name is Alice');
  });
});

describe('buildGraphExtractionPrompt', () => {
  it('returns system + user messages', () => {
    const messages = buildGraphExtractionPrompt(['Fact 1', 'Fact 2']);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });

  it('system prompt is GRAPH_EXTRACTION_PROMPT with entity types resolved', () => {
    const messages = buildGraphExtractionPrompt(['Fact 1']);
    // Should have entity types injected (no raw placeholder)
    expect(messages[0].content).not.toContain('{ENTITY_TYPES}');
    expect(messages[0].content).toContain('person');
    expect(messages[0].content).toContain('organization');
  });

  it('accepts custom entity types', () => {
    const messages = buildGraphExtractionPrompt(['Fact 1'], ['product', 'service', 'customer']);
    expect(messages[0].content).toContain('product, service, customer');
    // The entity_type constraint line should only contain custom types
    expect(messages[0].content).toContain('entity_type must be one of: product, service, customer.');
  });

  it('user message contains numbered facts', () => {
    const messages = buildGraphExtractionPrompt(['User likes cats', 'User works at Google']);
    expect(messages[1].content).toContain('1. User likes cats');
    expect(messages[1].content).toContain('2. User works at Google');
  });
});

describe('buildDedupPrompt', () => {
  it('returns system + user messages', () => {
    const messages = buildDedupPrompt(['new fact'], [{ lineage_id: 'lid-1', content: 'old fact' }]);
    expect(messages).toHaveLength(2);
  });

  it('system prompt is DEDUP_PROMPT', () => {
    const messages = buildDedupPrompt(['new fact'], [{ lineage_id: 'lid-1', content: 'old fact' }]);
    expect(messages[0].content).toBe(DEDUP_PROMPT);
  });

  it('user message contains new and existing facts', () => {
    const messages = buildDedupPrompt(
      ['User likes dogs'],
      [{ lineage_id: 'lid-1', content: 'User likes cats' }],
    );
    expect(messages[1].content).toContain('User likes dogs');
    expect(messages[1].content).toContain('User likes cats');
    expect(messages[1].content).toContain('lid-1');
  });
});

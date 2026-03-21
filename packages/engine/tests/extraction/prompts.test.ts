import { describe, it, expect } from 'vitest';
import { EXTRACTION_SYSTEM_PROMPT, buildExtractionPrompt } from '../../src/extraction/prompts.js';

describe('EXTRACTION_SYSTEM_PROMPT', () => {
  it('contains ATOMIC FACTS instruction', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('ATOMIC FACTS');
  });

  it('contains importance scoring guideline with 0.95', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('0.95');
  });

  it('contains importance scoring guideline mentioning Health', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('Health');
  });

  it('contains JSON output instruction', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('JSON');
  });

  it('contains entity type options: person', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('person');
  });

  it('contains entity type options: organization', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('organization');
  });

  it('contains edge_type options: associative', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('associative');
  });

  it('contains edge_type options: causal', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('causal');
  });

  it('contains operation options: ADD', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('ADD');
  });

  it('contains operation options: UPDATE', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('UPDATE');
  });

  it('contains operation options: INVALIDATE', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('INVALIDATE');
  });

  it('contains operation options: NOOP', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('NOOP');
  });

  it('contains operation options: CONTRADICT', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('CONTRADICT');
  });
});

describe('buildExtractionPrompt', () => {
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

  it('system message content equals EXTRACTION_SYSTEM_PROMPT', () => {
    const messages = buildExtractionPrompt('some text');
    expect(messages[0].content).toBe(EXTRACTION_SYSTEM_PROMPT);
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

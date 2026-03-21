import { describe, it, expect } from 'vitest';
import { extractHeuristic } from '../../src/extraction/heuristic.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findFact(result: ReturnType<typeof extractHeuristic>, substring: string) {
  return result.facts.find((f) => f.content.includes(substring));
}

function findEntity(result: ReturnType<typeof extractHeuristic>, name: string) {
  return result.entities.find(
    (e) => e.canonicalName === name.toLowerCase() || e.name.toLowerCase() === name.toLowerCase(),
  );
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe('extractHeuristic – metadata', () => {
  it('returns tier="heuristic"', () => {
    const result = extractHeuristic('Hello world');
    expect(result.tier).toBe('heuristic');
  });

  it('returns model=null', () => {
    const result = extractHeuristic('Hello world');
    expect(result.model).toBeNull();
  });

  it('returns tokensInput=0', () => {
    const result = extractHeuristic('Hello world');
    expect(result.tokensInput).toBe(0);
  });

  it('returns tokensOutput=0', () => {
    const result = extractHeuristic('Hello world');
    expect(result.tokensOutput).toBe(0);
  });

  it('always returns an edges array (may be empty)', () => {
    const result = extractHeuristic('Hello world');
    expect(Array.isArray(result.edges)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Empty / no-match
// ---------------------------------------------------------------------------

describe('extractHeuristic – no matches', () => {
  it('returns empty facts and entities for generic text', () => {
    const result = extractHeuristic('The weather is nice today');
    expect(result.facts).toHaveLength(0);
    expect(result.entities).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Regex extraction
// ---------------------------------------------------------------------------

describe('extractHeuristic – regex: email', () => {
  it('extracts an email address as a fact', () => {
    const result = extractHeuristic('You can reach me at alice@example.com anytime.');
    const fact = findFact(result, 'alice@example.com');
    expect(fact).toBeDefined();
    expect(fact?.content).toBe("User's email is alice@example.com");
  });

  it('email fact has confidence 0.9', () => {
    const result = extractHeuristic('My email is bob@test.org');
    const fact = findFact(result, 'bob@test.org');
    expect(fact?.confidence).toBe(0.9);
  });

  it('email fact has sourceType="conversation" and modality="text"', () => {
    const result = extractHeuristic('contact@company.co.uk');
    const fact = findFact(result, 'contact@company.co.uk');
    expect(fact?.sourceType).toBe('conversation');
    expect(fact?.modality).toBe('text');
  });
});

describe('extractHeuristic – regex: phone', () => {
  it('extracts a US phone number', () => {
    const result = extractHeuristic('Call me at (555) 123-4567');
    const fact = result.facts.find((f) => f.content.includes('phone number'));
    expect(fact).toBeDefined();
    expect(fact?.content).toContain('555');
  });

  it('extracts a dotted phone number', () => {
    const result = extractHeuristic('My number is 555.987.6543');
    const fact = result.facts.find((f) => f.content.includes('phone number'));
    expect(fact).toBeDefined();
  });
});

describe('extractHeuristic – regex: URL', () => {
  it('extracts a URL', () => {
    const result = extractHeuristic('Check out https://example.com for more info.');
    const fact = findFact(result, 'https://example.com');
    expect(fact).toBeDefined();
    expect(fact?.content).toContain('URL');
  });

  it('URL fact has confidence 0.9', () => {
    const result = extractHeuristic('Visit http://foo.bar/baz');
    const fact = result.facts.find((f) => f.tags.includes('url'));
    expect(fact?.confidence).toBe(0.9);
  });
});

describe('extractHeuristic – regex: date', () => {
  it('extracts a date in MM/DD/YYYY format', () => {
    const result = extractHeuristic('My birthday is 03/15/1990.');
    const fact = result.facts.find((f) => f.tags.includes('date'));
    expect(fact).toBeDefined();
  });

  it('extracts a spelled-out date', () => {
    const result = extractHeuristic('The event is on January 5th, 2025.');
    const fact = result.facts.find((f) => f.tags.includes('date'));
    expect(fact).toBeDefined();
  });
});

describe('extractHeuristic – regex: money', () => {
  it('extracts a dollar amount', () => {
    const result = extractHeuristic('The ticket costs $49.99.');
    const fact = result.facts.find((f) => f.tags.includes('money'));
    expect(fact).toBeDefined();
    expect(fact?.content).toContain('$49.99');
  });
});

// ---------------------------------------------------------------------------
// Pattern extraction
// ---------------------------------------------------------------------------

describe('extractHeuristic – pattern: identity', () => {
  it('extracts "I am a software engineer" → "User is a software engineer" (importance 0.85)', () => {
    const result = extractHeuristic('I am a software engineer.');
    const fact = findFact(result, 'User is a software engineer');
    expect(fact).toBeDefined();
    expect(fact?.importance).toBe(0.85);
  });

  it('extracts "I\'m a data scientist"', () => {
    const result = extractHeuristic("I'm a data scientist.");
    const fact = findFact(result, "User is a data scientist");
    expect(fact).toBeDefined();
    expect(fact?.importance).toBe(0.85);
  });
});

describe('extractHeuristic – pattern: name', () => {
  it('extracts "My name is Alice" with importance 0.9', () => {
    const result = extractHeuristic('My name is Alice.');
    const fact = findFact(result, "User's name is Alice");
    expect(fact).toBeDefined();
    expect(fact?.importance).toBe(0.9);
  });
});

describe('extractHeuristic – pattern: work', () => {
  it('extracts "I work at Google" → "User works at Google" (importance 0.8)', () => {
    const result = extractHeuristic('I work at Google.');
    const fact = findFact(result, 'User works at Google');
    expect(fact).toBeDefined();
    expect(fact?.importance).toBe(0.8);
  });

  it('extracts "I work for Microsoft"', () => {
    const result = extractHeuristic('I work for Microsoft.');
    const fact = findFact(result, 'User works at Microsoft');
    expect(fact).toBeDefined();
    expect(fact?.importance).toBe(0.8);
  });
});

describe('extractHeuristic – pattern: location', () => {
  it('extracts "I live in New York" → "User lives in New York" (importance 0.7)', () => {
    const result = extractHeuristic('I live in New York.');
    const fact = findFact(result, 'User lives in New York');
    expect(fact).toBeDefined();
    expect(fact?.importance).toBe(0.7);
  });

  it('extracts "I\'m from Paris"', () => {
    const result = extractHeuristic("I'm from Paris.");
    const fact = findFact(result, 'User is from Paris');
    expect(fact).toBeDefined();
    expect(fact?.importance).toBe(0.7);
  });
});

describe('extractHeuristic – pattern: preferences', () => {
  it('extracts "I like pizza" → "User likes pizza" (importance 0.6)', () => {
    const result = extractHeuristic('I like pizza.');
    const fact = findFact(result, 'User likes pizza');
    expect(fact).toBeDefined();
    expect(fact?.importance).toBe(0.6);
  });

  it('extracts "I love coffee"', () => {
    const result = extractHeuristic('I love coffee.');
    const fact = findFact(result, 'User likes coffee');
    expect(fact).toBeDefined();
    expect(fact?.importance).toBe(0.6);
  });

  it('extracts "I enjoy hiking"', () => {
    const result = extractHeuristic('I enjoy hiking.');
    const fact = findFact(result, 'User likes hiking');
    expect(fact).toBeDefined();
    expect(fact?.importance).toBe(0.6);
  });
});

describe('extractHeuristic – pattern: dislikes', () => {
  it('extracts "I hate mornings" → "User dislikes mornings" (importance 0.6)', () => {
    const result = extractHeuristic('I hate mornings.');
    const fact = findFact(result, 'User dislikes mornings');
    expect(fact).toBeDefined();
    expect(fact?.importance).toBe(0.6);
  });

  it('extracts "I dislike loud music"', () => {
    const result = extractHeuristic('I dislike loud music.');
    const fact = findFact(result, 'User dislikes loud music');
    expect(fact).toBeDefined();
    expect(fact?.importance).toBe(0.6);
  });
});

describe('extractHeuristic – pattern: allergy/health', () => {
  it('extracts "I\'m allergic to peanuts" → "User is allergic to peanuts" (importance 0.95)', () => {
    const result = extractHeuristic("I'm allergic to peanuts.");
    const fact = findFact(result, 'User is allergic to peanuts');
    expect(fact).toBeDefined();
    expect(fact?.importance).toBe(0.95);
  });

  it('extracts "I am allergic to shellfish"', () => {
    const result = extractHeuristic('I am allergic to shellfish.');
    const fact = findFact(result, 'User is allergic to shellfish');
    expect(fact).toBeDefined();
    expect(fact?.importance).toBe(0.95);
  });
});

// ---------------------------------------------------------------------------
// Confidence values
// ---------------------------------------------------------------------------

describe('extractHeuristic – confidence values', () => {
  it('pattern facts have confidence 0.7', () => {
    const result = extractHeuristic('I like pizza.');
    const fact = findFact(result, 'User likes pizza');
    expect(fact?.confidence).toBe(0.7);
  });

  it('regex facts have confidence 0.9', () => {
    const result = extractHeuristic('Email me at test@test.com');
    const fact = result.facts.find((f) => f.tags.includes('email'));
    expect(fact?.confidence).toBe(0.9);
  });
});

// ---------------------------------------------------------------------------
// NER entities
// ---------------------------------------------------------------------------

describe('extractHeuristic – NER entities', () => {
  it('extracts person names as entities with entityType="person"', () => {
    const result = extractHeuristic('I met John Smith yesterday.');
    const entity = result.entities.find((e) => e.entityType === 'person');
    expect(entity).toBeDefined();
    expect(entity?.entityType).toBe('person');
  });

  it('entity canonical names are lowercase', () => {
    const result = extractHeuristic('I work with Alice Johnson.');
    const person = result.entities.find((e) => e.entityType === 'person');
    expect(person).toBeDefined();
    expect(person?.canonicalName).toBe(person?.canonicalName.toLowerCase());
  });

  it('extracts organization names as entities with entityType="organization"', () => {
    const result = extractHeuristic('I work at Apple Inc.');
    const entity = result.entities.find((e) => e.entityType === 'organization');
    expect(entity).toBeDefined();
    expect(entity?.entityType).toBe('organization');
  });

  it('entities have empty properties object', () => {
    const result = extractHeuristic('John Smith is my friend.');
    const entity = result.entities.find((e) => e.entityType === 'person');
    expect(entity).toBeDefined();
    expect(entity?.properties).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Multi-line / conversation format
// ---------------------------------------------------------------------------

describe('extractHeuristic – multi-line conversation', () => {
  it('extracts facts from multiple lines', () => {
    const text = [
      'user: I like pizza.',
      'user: I work at Google.',
      'user: I live in Seattle.',
    ].join('\n');
    const result = extractHeuristic(text);
    expect(findFact(result, 'User likes pizza')).toBeDefined();
    expect(findFact(result, 'User works at Google')).toBeDefined();
    expect(findFact(result, 'User lives in Seattle')).toBeDefined();
  });

  it('strips role prefix before pattern matching', () => {
    const result = extractHeuristic('user: I am a software engineer.');
    const fact = findFact(result, 'User is a software engineer');
    expect(fact).toBeDefined();
  });

  it('handles "assistant:" prefix lines without crashing', () => {
    const text = 'assistant: That sounds great!\nuser: I like pizza.';
    const result = extractHeuristic(text);
    expect(findFact(result, 'User likes pizza')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// De-duplication
// ---------------------------------------------------------------------------

describe('extractHeuristic – deduplication', () => {
  it('does not produce duplicate facts for the same content', () => {
    const text = 'I like pizza. I like pizza.';
    const result = extractHeuristic(text);
    const pizzaFacts = result.facts.filter((f) => f.content.includes('pizza'));
    expect(pizzaFacts.length).toBeLessThanOrEqual(1);
  });

  it('does not produce duplicate entities', () => {
    const text = 'John Smith called. John Smith called again.';
    const result = extractHeuristic(text);
    const johnSmith = result.entities.filter(
      (e) => e.canonicalName === 'john smith',
    );
    expect(johnSmith.length).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// sourceType and modality
// ---------------------------------------------------------------------------

describe('extractHeuristic – fact fields', () => {
  it('all facts have sourceType="conversation"', () => {
    const result = extractHeuristic('I work at Acme. My email is x@y.com.');
    for (const fact of result.facts) {
      expect(fact.sourceType).toBe('conversation');
    }
  });

  it('all facts have modality="text"', () => {
    const result = extractHeuristic('I work at Acme. My email is x@y.com.');
    for (const fact of result.facts) {
      expect(fact.modality).toBe('text');
    }
  });
});

import nlp from 'compromise';
import type { ExtractionResult, ExtractedFact, ExtractedEntity } from './types.js';

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

const REGEX = {
  email: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
  phone: /(?:\+?1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}\b/g,
  url: /https?:\/\/[^\s/$.?#].[^\s]*/g,
  date: /\b(?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{2}[\/\-]\d{2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4})\b/gi,
  money: /\$\s?\d+(?:[.,]\d+)*(?:\.\d{2})?|\b\d+(?:[.,]\d+)*(?:\.\d{2})?\s?(?:dollars?|USD|EUR|GBP|euros?|pounds?)\b/gi,
};

// ---------------------------------------------------------------------------
// Pattern rules for personal facts
// ---------------------------------------------------------------------------

interface PatternRule {
  pattern: RegExp;
  template: (match: RegExpMatchArray) => string;
  importance: number;
  tags: string[];
}

const PATTERN_RULES: PatternRule[] = [
  // Health / allergy — importance 0.95
  {
    pattern: /\bi(?:'m| am)\s+allergic\s+to\s+(.+?)(?:[.!?]|$)/i,
    template: (m) => `User is allergic to ${m[1]!.trim()}`,
    importance: 0.95,
    tags: ['health', 'allergy'],
  },
  {
    pattern: /\bi\s+have\s+(?:a\s+)?(?:allergy|allergies)\s+to\s+(.+?)(?:[.!?]|$)/i,
    template: (m) => `User is allergic to ${m[1]!.trim()}`,
    importance: 0.95,
    tags: ['health', 'allergy'],
  },
  {
    pattern: /\bi\s+(?:have|suffer from|was diagnosed with)\s+(.+?)(?:[.!?]|$)/i,
    template: (m) => `User has ${m[1]!.trim()}`,
    importance: 0.95,
    tags: ['health'],
  },

  // Name — importance 0.9
  {
    pattern: /\bmy\s+name\s+is\s+([A-Za-z][a-zA-Z\s\-']{1,40}?)(?:[.!?,]|$)/i,
    template: (m) => `User's name is ${m[1]!.trim()}`,
    importance: 0.9,
    tags: ['identity', 'name'],
  },
  {
    pattern: /\bthey\s+call\s+me\s+([A-Za-z][a-zA-Z\s\-']{1,40}?)(?:[.!?,]|$)/i,
    template: (m) => `User's name is ${m[1]!.trim()}`,
    importance: 0.9,
    tags: ['identity', 'name'],
  },

  // Identity — importance 0.85
  {
    pattern: /\bi(?:'m| am)\s+a(?:n)?\s+(.+?)(?:[.!?]|$)/i,
    template: (m) => `User is a ${m[1]!.trim()}`,
    importance: 0.85,
    tags: ['identity'],
  },
  {
    pattern: /\bi(?:'m| am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)(?:[.!?,]|$)/,
    template: (m) => `User is ${m[1]!.trim()}`,
    importance: 0.85,
    tags: ['identity'],
  },

  // Work / company — importance 0.8
  {
    pattern: /\bi\s+work\s+(?:at|for)\s+(.+?)(?:[.!?]|$)/i,
    template: (m) => `User works at ${m[1]!.trim()}`,
    importance: 0.8,
    tags: ['work', 'company'],
  },
  {
    pattern: /\bmy\s+(?:job|career|profession|occupation)\s+is\s+(.+?)(?:[.!?]|$)/i,
    template: (m) => `User's job is ${m[1]!.trim()}`,
    importance: 0.8,
    tags: ['work'],
  },
  {
    pattern: /\bi\s+(?:work|am employed)\s+as\s+(?:a(?:n)?\s+)?(.+?)(?:[.!?]|$)/i,
    template: (m) => `User works as ${m[1]!.trim()}`,
    importance: 0.8,
    tags: ['work'],
  },

  // Location — importance 0.7
  {
    pattern: /\bi\s+live\s+in\s+(.+?)(?:[.!?]|$)/i,
    template: (m) => `User lives in ${m[1]!.trim()}`,
    importance: 0.7,
    tags: ['location'],
  },
  {
    pattern: /\bi(?:'m| am)\s+from\s+(.+?)(?:[.!?]|$)/i,
    template: (m) => `User is from ${m[1]!.trim()}`,
    importance: 0.7,
    tags: ['location'],
  },
  {
    pattern: /\bi\s+(?:moved|relocated)\s+to\s+(.+?)(?:[.!?]|$)/i,
    template: (m) => `User moved to ${m[1]!.trim()}`,
    importance: 0.7,
    tags: ['location'],
  },

  // Preferences (like/love/enjoy) — importance 0.6
  {
    pattern: /\bi\s+(?:really\s+)?(?:like|love|enjoy|adore)\s+(.+?)(?:[.!?]|$)/i,
    template: (m) => `User likes ${m[1]!.trim()}`,
    importance: 0.6,
    tags: ['preference', 'like'],
  },
  {
    pattern: /\bmy\s+favorite\s+(?:\w+\s+)?is\s+(.+?)(?:[.!?]|$)/i,
    template: (m) => `User's favorite is ${m[1]!.trim()}`,
    importance: 0.6,
    tags: ['preference', 'like'],
  },

  // Dislikes — importance 0.6
  {
    pattern: /\bi\s+(?:really\s+)?(?:hate|dislike|can'?t stand|despise|detest)\s+(.+?)(?:[.!?]|$)/i,
    template: (m) => `User dislikes ${m[1]!.trim()}`,
    importance: 0.6,
    tags: ['preference', 'dislike'],
  },

  // Trivia / other — importance 0.3
  {
    pattern: /\bi\s+(?:think|believe|feel|guess|suppose)\s+(?:that\s+)?(.+?)(?:[.!?]|$)/i,
    template: (m) => `User thinks ${m[1]!.trim()}`,
    importance: 0.3,
    tags: ['opinion'],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip a "role: " prefix like "user: " or "assistant: " from a line. */
function stripRolePrefix(line: string): string {
  return line.replace(/^[a-zA-Z_\-]+:\s*/, '');
}

function makeFact(
  content: string,
  originalContent: string,
  importance: number,
  confidence: number,
  tags: string[],
): ExtractedFact {
  return {
    content,
    importance,
    confidence,
    sourceType: 'conversation',
    modality: 'text',
    tags,
    originalContent,
    operation: 'add',
  };
}

// ---------------------------------------------------------------------------
// Regex extraction (runs on the full text)
// ---------------------------------------------------------------------------

function extractRegex(text: string): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  const seenContents = new Set<string>();

  function addFact(content: string, original: string, tags: string[]): void {
    if (!seenContents.has(content)) {
      seenContents.add(content);
      facts.push(makeFact(content, original, 0.8, 0.9, tags));
    }
  }

  // Emails
  for (const match of text.matchAll(REGEX.email)) {
    const email = match[0]!;
    addFact(`User's email is ${email}`, email, ['contact', 'email']);
  }

  // Phone numbers
  for (const match of text.matchAll(REGEX.phone)) {
    const phone = match[0]!;
    addFact(`User's phone number is ${phone}`, phone, ['contact', 'phone']);
  }

  // URLs
  for (const match of text.matchAll(REGEX.url)) {
    const url = match[0]!;
    addFact(`User mentioned URL: ${url}`, url, ['url']);
  }

  // Dates
  for (const match of text.matchAll(REGEX.date)) {
    const date = match[0]!;
    addFact(`Mentioned date: ${date}`, date, ['date']);
  }

  // Money
  for (const match of text.matchAll(REGEX.money)) {
    const amount = match[0]!;
    addFact(`Mentioned monetary amount: ${amount}`, amount, ['money']);
  }

  return facts;
}

// ---------------------------------------------------------------------------
// Pattern extraction (runs line by line, role prefix stripped)
// ---------------------------------------------------------------------------

function extractPatterns(lines: string[]): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  const seenContents = new Set<string>();

  for (const rawLine of lines) {
    const line = stripRolePrefix(rawLine).trim();
    if (!line) continue;

    for (const rule of PATTERN_RULES) {
      // Reset lastIndex for global regexes (these aren't global, but be safe)
      const match = line.match(rule.pattern);
      if (match) {
        const content = rule.template(match);
        if (!seenContents.has(content)) {
          seenContents.add(content);
          facts.push(makeFact(content, line, rule.importance, 0.7, rule.tags));
        }
        // Only use the first matching rule per line to avoid overlapping facts
        break;
      }
    }
  }

  return facts;
}

// ---------------------------------------------------------------------------
// NER via compromise
// ---------------------------------------------------------------------------

function extractEntities(text: string): ExtractedEntity[] {
  const doc = nlp(text);
  const entities: ExtractedEntity[] = [];
  const seenCanonical = new Set<string>();

  function addEntity(name: string, entityType: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    const canonical = trimmed.toLowerCase();
    if (!seenCanonical.has(`${entityType}:${canonical}`)) {
      seenCanonical.add(`${entityType}:${canonical}`);
      entities.push({
        name: trimmed,
        entityType,
        canonicalName: canonical,
        properties: {},
      });
    }
  }

  // People
  const people = doc.people().out('array') as string[];
  for (const name of people) {
    addEntity(name, 'person');
  }

  // Organizations
  const orgs = doc.organizations().out('array') as string[];
  for (const org of orgs) {
    addEntity(org, 'organization');
  }

  // Places
  const places = doc.places().out('array') as string[];
  for (const place of places) {
    addEntity(place, 'location');
  }

  return entities;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function extractHeuristic(text: string): ExtractionResult {
  const lines = text.split('\n');

  // 1. Regex extraction — run on full text
  const regexFacts = extractRegex(text);
  const regexContents = new Set(regexFacts.map((f) => f.content));

  // 2. Pattern extraction — line by line, strip role prefix
  const patternFacts = extractPatterns(lines);

  // 3. De-duplicate: remove pattern facts whose content overlaps with regex facts
  //    (e.g., if regex grabbed the email and a pattern also mentions it)
  const filteredPatternFacts = patternFacts.filter((f) => !regexContents.has(f.content));

  // 4. NER entities via compromise
  const entities = extractEntities(text);

  const facts = [...regexFacts, ...filteredPatternFacts];

  // Overall confidence: weighted average or fixed 0.9 for regex, 0.7 for pattern
  // Use the maximum confidence across extracted facts, or 0.9 if only regex results exist
  const confidence = facts.length > 0
    ? Math.max(...facts.map((f) => f.confidence))
    : entities.length > 0
      ? 0.6
      : 0.5;

  return {
    facts,
    entities,
    edges: [],
    tier: 'heuristic',
    confidence,
    tokensInput: 0,
    tokensOutput: 0,
    model: null,
  };
}

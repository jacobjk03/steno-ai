import { describe, it, expect } from 'vitest';
import { toSnakeCaseWire, toCamelCaseWire } from '../../src/lib/wire-format.js';

describe('toSnakeCaseWire', () => {
  it('converts simple camelCase keys to snake_case', () => {
    expect(toSnakeCaseWire({ scopeId: 'x' })).toEqual({ scope_id: 'x' });
  });

  it('converts nested objects recursively', () => {
    const input = { fact: { validFrom: '2024-01-01', createdAt: '2024-01-01' } };
    expect(toSnakeCaseWire(input)).toEqual({
      fact: { valid_from: '2024-01-01', created_at: '2024-01-01' },
    });
  });

  it('converts arrays of objects', () => {
    const input = [{ scopeId: 'x' }, { scopeId: 'y' }];
    expect(toSnakeCaseWire(input)).toEqual([{ scope_id: 'x' }, { scope_id: 'y' }]);
  });

  it('converts Date objects to ISO 8601 strings', () => {
    const date = new Date('2024-06-15T12:00:00.000Z');
    const result = toSnakeCaseWire({ createdAt: date });
    expect(result).toEqual({ created_at: '2024-06-15T12:00:00.000Z' });
  });

  it('preserves null values', () => {
    expect(toSnakeCaseWire({ validUntil: null })).toEqual({ valid_until: null });
  });

  it('preserves undefined at the top level', () => {
    expect(toSnakeCaseWire(undefined)).toBeUndefined();
  });

  it('passes through primitive string values unchanged', () => {
    expect(toSnakeCaseWire('hello')).toBe('hello');
  });

  it('passes through primitive number values unchanged', () => {
    expect(toSnakeCaseWire(42)).toBe(42);
  });

  it('passes through primitive boolean values unchanged', () => {
    expect(toSnakeCaseWire(true)).toBe(true);
  });

  it('leaves single-word keys unchanged', () => {
    expect(toSnakeCaseWire({ id: 'x', name: 'test' })).toEqual({ id: 'x', name: 'test' });
  });

  it('handles deeply nested structures (3+ levels)', () => {
    const input = {
      levelOne: {
        levelTwo: {
          levelThree: {
            deepValue: 'found',
          },
        },
      },
    };
    expect(toSnakeCaseWire(input)).toEqual({
      level_one: {
        level_two: {
          level_three: {
            deep_value: 'found',
          },
        },
      },
    });
  });

  it('handles mixed arrays with objects and primitives', () => {
    const input = { items: [1, 'two', { innerKey: 3 }] };
    expect(toSnakeCaseWire(input)).toEqual({ items: [1, 'two', { inner_key: 3 }] });
  });

  it('returns null when given null', () => {
    expect(toSnakeCaseWire(null)).toBeNull();
  });
});

describe('toCamelCaseWire', () => {
  it('converts simple snake_case keys to camelCase', () => {
    expect(toCamelCaseWire({ scope_id: 'x' })).toEqual({ scopeId: 'x' });
  });

  it('converts nested objects recursively', () => {
    const input = { fact: { valid_from: '2024-01-01', created_at: '2024-01-01' } };
    expect(toCamelCaseWire(input)).toEqual({
      fact: { validFrom: '2024-01-01', createdAt: '2024-01-01' },
    });
  });

  it('converts arrays of objects', () => {
    const input = [{ scope_id: 'x' }, { scope_id: 'y' }];
    expect(toCamelCaseWire(input)).toEqual([{ scopeId: 'x' }, { scopeId: 'y' }]);
  });

  it('leaves single-word keys unchanged', () => {
    expect(toCamelCaseWire({ id: 'x', name: 'test' })).toEqual({ id: 'x', name: 'test' });
  });

  it('handles deeply nested structures', () => {
    const input = {
      level_one: {
        level_two: {
          deep_value: 'found',
        },
      },
    };
    expect(toCamelCaseWire(input)).toEqual({
      levelOne: {
        levelTwo: {
          deepValue: 'found',
        },
      },
    });
  });
});

describe('round-trip', () => {
  it('camelCase -> snake_case -> camelCase produces the original object', () => {
    const original = {
      scopeId: 'abc',
      validFrom: '2024-01-01',
      nested: { innerKey: 'val', anotherProp: 42 },
      items: [{ itemName: 'one' }],
    };
    const snake = toSnakeCaseWire(original);
    const backToCamel = toCamelCaseWire(snake);
    expect(backToCamel).toEqual(original);
  });

  it('snake_case -> camelCase -> snake_case produces the original object', () => {
    const original = {
      scope_id: 'abc',
      valid_from: '2024-01-01',
      nested: { inner_key: 'val', another_prop: 42 },
      items: [{ item_name: 'one' }],
    };
    const camel = toCamelCaseWire(original);
    const backToSnake = toSnakeCaseWire(camel);
    expect(backToSnake).toEqual(original);
  });
});

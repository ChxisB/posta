import { describe, it, expect } from 'bun:test';
import { QueryString } from '../query_string';

describe('QueryString', () => {
  it('works with a single item', () => {
    const qs = new QueryString('to: test@example.com');
    expect(qs.get('to')).toBe('test@example.com');
  });

  it('works with multiple items', () => {
    const qs = new QueryString('to: test@example.com from: another@example.com');
    expect(qs.get('to')).toBe('test@example.com');
    expect(qs.get('from')).toBe('another@example.com');
  });

  it('does not require a space after the field name', () => {
    const qs = new QueryString('to:test@example.com from:another@example.com');
    expect(qs.get('to')).toBe('test@example.com');
    expect(qs.get('from')).toBe('another@example.com');
  });

  it('returns null when it receives [blank]', () => {
    const qs = new QueryString('to:[blank]');
    expect(qs.get('to')).toBeNull();
  });

  it('handles dates with spaces', () => {
    const qs = new QueryString('date: 2017-02-12 15:20');
    expect(qs.get('date')).toBe('2017-02-12 15:20');
  });

  it('returns an array for multiple values of the same key', () => {
    const qs = new QueryString('to: test@example.com to: another@example.com');
    const result = qs.get('to');
    expect(Array.isArray(result)).toBe(true);
    expect((result as string[])[0]).toBe('test@example.com');
    expect((result as string[])[1]).toBe('another@example.com');
  });

  it('works with a z in the string', () => {
    const qs = new QueryString('to: testaz@example.com');
    expect(qs.get('to')).toBe('testaz@example.com');
  });

  it('handles quoted values with spaces', () => {
    const qs = new QueryString('subject: "hello world"');
    expect(qs.get('subject')).toBe('hello world');
  });

  it('returns undefined for missing keys', () => {
    const qs = new QueryString('to: test@example.com');
    expect(qs.get('from')).toBeUndefined();
  });

  it('isEmpty returns true for empty input', () => {
    const qs = new QueryString('');
    expect(qs.isEmpty()).toBe(true);
  });

  it('isEmpty returns false for non-empty input', () => {
    const qs = new QueryString('to: test@example.com');
    expect(qs.isEmpty()).toBe(false);
  });

  it('parse returns the full hash', () => {
    const qs = new QueryString('to: test@example.com from: another@example.com');
    const hash = qs.parse();
    expect(hash).toEqual({
      to: 'test@example.com',
      from: 'another@example.com',
    });
  });

  it('handles three or more values for the same key', () => {
    const qs = new QueryString('to: a@b.com to: c@d.com to: e@f.com');
    const result = qs.get('to');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual(['a@b.com', 'c@d.com', 'e@f.com']);
  });

  it('handles mixed key types in one string', () => {
    const qs = new QueryString('to: user@example.com subject: "meeting notes" date: 2020-01-15 09:30 tag: [blank]');
    expect(qs.get('to')).toBe('user@example.com');
    expect(qs.get('subject')).toBe('meeting notes');
    expect(qs.get('date')).toBe('2020-01-15 09:30');
    expect(qs.get('tag')).toBeNull();
  });

  it('handles whitespace-only input', () => {
    const qs = new QueryString('   ');
    expect(qs.isEmpty()).toBe(true);
  });
});

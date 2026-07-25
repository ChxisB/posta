/**
 * Parses search/query strings into key-value pairs.
 *
 * Ported from the Ruby `QueryString` class (app/lib/query_string.rb).
 *
 * Supports:
 *   - Simple values:          `key: value`
 *   - Quoted values:          `key: "value with spaces"`
 *   - Date-time values:       `date: 2020-01-01 12:00`
 *   - Blank sentinel:         `key: [blank]` → null
 *   - Multiple values:        `key: a key: b` → ["a", "b"]
 *
 * @example
 * ```ts
 * const qs = new QueryString('to: user@example.com from: "John Doe" date: 2020-01-01 12:00');
 * qs.get('to');   // "user@example.com"
 * qs.get('from'); // "John Doe"
 * qs.get('date'); // "2020-01-01 12:00"
 * ```
 */
export class QueryString {
  private readonly input: string;
  private parsed: Record<string, string | string[] | null> | null = null;

  constructor(input: string) {
    // Mirror Ruby: strip + append trailing space so the regex always has a
    // terminator after the last token.
    this.input = input.trim() + ' ';
  }

  /**
   * Return the parsed hash, computing it lazily on first access.
   */
  parse(): Record<string, string | string[] | null> {
    if (this.parsed !== null) return this.parsed;

    const regex = /([a-z]+):\s*(?:(\d{2,4}-\d{2}-\d{2}\s\d{2}:\d{2})|"(.*?)"|(.*?))(\s|$)/g;
    const result: Record<string, string | string[] | null> = {};

    let match: RegExpExecArray | null;
    while ((match = regex.exec(this.input)) !== null) {
      const key = match[1];
      const dateValue = match[2];
      const quotedValue = match[3];
      const plainValue = match[4];

      let actualValue: string | null;

      if (dateValue !== undefined && dateValue !== '') {
        actualValue = dateValue;
      } else if (quotedValue !== undefined && quotedValue !== '') {
        actualValue = quotedValue;
      } else if (plainValue === '[blank]') {
        actualValue = null;
      } else {
        actualValue = plainValue ?? null;
      }

      if (key in result) {
        const existing = result[key];
        if (Array.isArray(existing)) {
          existing.push(actualValue as string);
        } else {
          result[key] = [existing as string, actualValue as string];
        }
      } else {
        result[key] = actualValue;
      }
    }

    this.parsed = result;
    return result;
  }

  /**
   * Get the value for a given key.
   */
  get(key: string): string | string[] | null | undefined {
    return this.parse()[key];
  }

  /**
   * Whether the parsed result contains no keys.
   */
  isEmpty(): boolean {
    return Object.keys(this.parse()).length === 0;
  }
}

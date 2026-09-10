import { describe, expect, it } from 'bun:test';
import { splitStatements } from './client';

describe('splitStatements', () => {
  it('splits ordinary statements on semicolons', () => {
    expect(splitStatements('SELECT 1; SELECT 2;')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('ignores trailing and repeated semicolons', () => {
    expect(splitStatements('SELECT 1;;\n\n;')).toEqual(['SELECT 1']);
  });

  it('keeps a dollar-quoted function body intact', () => {
    // The regression this was written for: the naive split produced five
    // fragments here and Postgres answered "unterminated dollar-quoted
    // string", which made triggers and stored procedures unusable.
    const sql = `
CREATE FUNCTION notify_queue() RETURNS trigger AS $BODY$
BEGIN
  PERFORM pg_notify('posta_queued_messages', '');
  RETURN NULL;
END;
$BODY$ LANGUAGE plpgsql;

CREATE TRIGGER t AFTER INSERT ON queued_messages
FOR EACH STATEMENT EXECUTE FUNCTION notify_queue();`;

    const out = splitStatements(sql);
    expect(out).toHaveLength(2);
    expect(out[0]).toContain('RETURN NULL;');
    expect(out[0]).toContain('$BODY$ LANGUAGE plpgsql');
    expect(out[1]).toContain('CREATE TRIGGER');
  });

  it('handles an untagged $$ body', () => {
    const out = splitStatements(
      'CREATE FUNCTION f() RETURNS int AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql;',
    );
    expect(out).toHaveLength(1);
  });

  it('matches the closing tag exactly, so a different inner tag does not end the body', () => {
    const sql = 'CREATE FUNCTION f() AS $OUTER$ SELECT $x$ inner; text $x$; $OUTER$ LANGUAGE sql;';
    expect(splitStatements(sql)).toHaveLength(1);
  });

  it('does not split on a semicolon inside a string literal', () => {
    const out = splitStatements("INSERT INTO t (v) VALUES ('a;b'); SELECT 1;");
    expect(out).toHaveLength(2);
    expect(out[0]).toContain("'a;b'");
  });

  it('handles doubled quotes inside a literal', () => {
    const out = splitStatements("INSERT INTO t (v) VALUES ('it''s; fine'); SELECT 1;");
    expect(out).toHaveLength(2);
    expect(out[0]).toContain("it''s; fine");
  });

  it('does not split on a semicolon inside a quoted identifier', () => {
    expect(splitStatements('SELECT "we;ird" FROM t; SELECT 1;')).toHaveLength(2);
  });

  it('does not split on a semicolon inside a line comment', () => {
    const out = splitStatements('SELECT 1; -- trailing; comment\nSELECT 2;');
    expect(out).toHaveLength(2);
  });

  it('does not split on a semicolon inside a block comment', () => {
    const out = splitStatements('SELECT 1; /* a; b */ SELECT 2;');
    expect(out).toHaveLength(2);
  });

  it('emits the remainder rather than truncating when a body is unterminated', () => {
    // Better to hand Postgres something it will reject with a clear message
    // than to silently drop the tail of a migration.
    const out = splitStatements('CREATE FUNCTION f() AS $BODY$ BEGIN');
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('BEGIN');
  });

  it('returns nothing for whitespace alone', () => {
    expect(splitStatements('   \n\n  ')).toEqual([]);
  });
});

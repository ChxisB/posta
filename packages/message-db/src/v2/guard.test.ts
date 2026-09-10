import { describe, expect, it } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Structural guard on the v2 repositories.
 *
 * The isolation tests prove that *today's* repository confines a tenant. They
 * cannot prove anything about the repositories still to be written, or about
 * the method someone adds in six months. This file checks the shape of the
 * source instead, so the guarantee survives authors who have never read
 * scope.ts.
 *
 * Static analysis of source text is normally a poor substitute for types, and
 * the branding on `TenantScope` does most of the work at compile time. What
 * it cannot catch is a method that simply never takes a scope, or one that
 * hand-writes `tenant_id = $1` into a query string and bypasses the builder
 * entirely — both of which compile perfectly and leak silently.
 */

const V2_DIR = import.meta.dirname;

/**
 * Modules the repository rules apply to.
 *
 * `scope.ts` is the kernel the rules are about. `backfill.ts` is a migration,
 * not a repository: it reads a legacy schema and writes v2 in bulk SQL, so it
 * genuinely cannot compose queries through the scope builder. It gets its own
 * narrower rule below rather than an exemption, because "this file is
 * special" is how the first real hole gets introduced.
 */
const NOT_REPOSITORIES = ['scope.ts', 'backfill.ts', 'migration-mode.ts', 'sampler.ts'];

function repositoryFiles(): Array<{ name: string; source: string }> {
  return readdirSync(V2_DIR)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !NOT_REPOSITORIES.includes(f))
    .map((name) => ({ name, source: readFileSync(join(V2_DIR, name), 'utf8') }));
}

/** Tables carrying tenant_id, i.e. everything a query must be scoped against. */
const SCOPED_TABLES = [
  'messages',
  'deliveries',
  'links',
  'clicks',
  'loads',
  'spam_checks',
  'suppressions',
];

/**
 * Public methods of an exported class, with their first parameter.
 *
 * Deliberately simple matching rather than a real parser: the repositories
 * are written in one consistent style, and a guard nobody can read is a guard
 * that gets deleted the first time it is inconvenient.
 */
function publicMethods(source: string): Array<{ name: string; firstParam: string }> {
  const out: Array<{ name: string; firstParam: string }> = [];
  const re = /^ {2}(?:async )?([a-zA-Z][a-zA-Z0-9_]*)\s*\(([^)]*)/gm;

  for (const match of source.matchAll(re)) {
    const [, name, params] = match;
    if (['constructor', 'if', 'for', 'while', 'switch', 'catch'].includes(name)) continue;
    out.push({ name, firstParam: params.trim().split(',')[0]?.trim() ?? '' });
  }
  return out;
}

describe('every repository method is tenant-scoped', () => {
  const files = repositoryFiles();

  it('finds repository modules to check', () => {
    // Guards the guard: a rename that emptied this list would make every
    // assertion below pass vacuously.
    expect(files.length).toBeGreaterThan(0);
  });

  for (const { name, source } of files) {
    const methods = publicMethods(source);

    it(`${name}: every method takes a TenantScope first`, () => {
      const unscoped = methods.filter((m) => !/^scope\s*:\s*TenantScope/.test(m.firstParam));
      expect(
        unscoped.map((m) => `${m.name}(${m.firstParam})`),
        'these methods can be called without a tenant scope',
      ).toEqual([]);
    });

    it(`${name}: exposes methods at all`, () => {
      expect(methods.length).toBeGreaterThan(0);
    });
  }
});

describe('no repository bypasses the scope builder', () => {
  for (const { name, source } of repositoryFiles()) {
    it(`${name}: never hand-writes a tenant predicate`, () => {
      // A hand-written `tenant_id = $1` looks correct and usually is — until
      // someone appends a condition and the numbering shifts. Every tenant
      // predicate must come from where(), which owns the numbering.
      expect(source, 'tenant predicate written by hand instead of via where()').not.toMatch(
        /tenant_id\s*=\s*\$\d/,
      );
    });

    it(`${name}: every read or write on a scoped table interpolates a built clause`, () => {
      // Reads and updates are scoped by a WHERE clause, so each must
      // interpolate `${...sql}` — the output of where()/and().
      //
      // INSERT is the exception, and deliberately a separate rule below: it
      // has no WHERE, and is scoped by insertColumns(scope) supplying the
      // tenant_id column instead. Conflating the two would either wave
      // inserts through or demand a clause they cannot have.
      const literals = source.match(/`[^`]*`/gs) ?? [];
      const offenders = literals.filter((literal) => {
        if (/INSERT\s+INTO/i.test(literal)) return false;
        const touchesScopedTable = SCOPED_TABLES.some((t) =>
          new RegExp(`\\b(FROM|UPDATE|JOIN)\\s+${t}\\b`, 'i').test(literal),
        );
        if (!touchesScopedTable) return false;
        return !/\$\{[^}]*\.sql\}/.test(literal);
      });

      expect(offenders.map((o) => o.slice(0, 70)), 'unscoped query on a tenant table').toEqual([]);
    });

    it(`${name}: every insert into a scoped table is attributed via insertColumns`, () => {
      const inserts = (source.match(/`[^`]*`/gs) ?? []).filter(
        (literal) =>
          /INSERT\s+INTO/i.test(literal) &&
          SCOPED_TABLES.some((t) => new RegExp(`INSERT\\s+INTO\\s+${t}\\b`, 'i').test(literal)),
      );
      if (inserts.length === 0) return;

      // An insert that does not go through insertColumns writes a row with a
      // null or zero tenant_id — invisible to its owner, and depending on the
      // next query, visible to everyone.
      expect(source, 'inserts into a tenant table without insertColumns(scope)').toMatch(
        /insertColumns\(scope\)/,
      );
    });

    it(`${name}: imports the scope kernel rather than reimplementing it`, () => {
      expect(source).toMatch(/from '\.\/scope'/);
    });
  }
});

/**
 * Only `messages` and `suppressions` carry a server_id column. Everything
 * else inherits its server from the message it belongs to.
 */
const TABLES_WITH_SERVER_ID = ['messages', 'suppressions'];

describe('server scoping matches the schema', () => {
  for (const { name, source } of repositoryFiles()) {
    it(`${name}: uses tenantOnly for tables that have no server_id`, () => {
      // where() emits `server_id = $2` for a server-narrowed scope. Against a
      // table without that column the query fails outright — and against
      // suppressions, where the column is nullable, it silently excludes the
      // tenant-wide rows instead, which is worse because nothing errors.
      //
      // This bit three repositories before the rule was written down.
      const literals = source.match(/`[^`]*`/gs) ?? [];
      const touchesServerlessTable = literals.some((literal) =>
        SCOPED_TABLES.filter((t) => !TABLES_WITH_SERVER_ID.includes(t)).some((t) =>
          new RegExp(`\\b(FROM|UPDATE|JOIN)\\s+${t}\\b`, 'i').test(literal),
        ),
      );
      if (!touchesServerlessTable) return;

      expect(source, 'queries a table without server_id but does not use tenantOnly').toMatch(
        /tenantOnly\(scope\)/,
      );
    });
  }
});

describe('the backfill', () => {
  const source = readFileSync(join(V2_DIR, 'backfill.ts'), 'utf8');

  it('names tenant_id in every insert into a scoped table', () => {
    // The backfill cannot use the scope builder, so the property is checked
    // directly instead: a bulk INSERT that omitted tenant_id would write
    // millions of unattributed rows in one statement.
    const inserts = (source.match(/INSERT INTO (\w+)\s*\(([^)]*)\)/gis) ?? []).filter((stmt) =>
      SCOPED_TABLES.some((t) => new RegExp(`INSERT INTO ${t}\\b`, 'i').test(stmt)),
    );
    expect(inserts.length).toBeGreaterThan(0);
    for (const stmt of inserts) {
      expect(stmt, 'bulk insert without tenant_id').toMatch(/tenant_id/);
    }
  });

  it('never modifies the source schema', () => {
    // The rollback plan is "truncate v2 and run again", which only works
    // while the legacy schema is untouched.
    expect(source).not.toMatch(/DELETE FROM \$\{s\}|UPDATE \$\{s\}|DROP .*\$\{s\}/);
  });
});

describe('the scope kernel itself', () => {
  const scope = readFileSync(join(V2_DIR, 'scope.ts'), 'utf8');

  it('is the only place a tenant predicate is written', () => {
    expect(scope).toMatch(/tenant_id = \$1/);
  });

  it('exposes no way to build an unscoped clause', () => {
    // If `where` ever gained an optional scope, every guarantee above would
    // become advisory.
    expect(scope).toMatch(/export function where\(scope: TenantScope/);
    expect(scope).not.toMatch(/export function where\(scope\?/);
  });

  it('validates rather than coercing', () => {
    // Number(undefined) is NaN and Number(null) is 0; either would produce a
    // query that matches nothing and reads as "this tenant has no data".
    expect(scope).toMatch(/Number\.isInteger/);
  });
});

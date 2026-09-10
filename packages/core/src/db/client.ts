import postgres from 'postgres';

export type Sql = postgres.Sql;

/**
 * Row returned by a PostgreSQL query.
 */
export type Row = Record<string, unknown>;

/**
 * Result of an INSERT/UPDATE/DELETE execution.
 */
export interface RunResult {
  changes: number;
  lastInsertRowid?: number | bigint;
}

/**
 * Common database operations exposed by both the connection client and
 * transaction clients so callers don't need to know which they hold.
 */
export interface Queryable {
  query<T = Row>(sql: string, params?: any[]): Promise<T[]>;
  get<T = Row>(sql: string, params?: any[]): Promise<T | undefined>;
  run(sql: string, params?: any[]): Promise<RunResult>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (client: Queryable) => Promise<T>): Promise<T>;
}

/**
 * Transaction-scoped queryable implementation.
 */
class TxClient implements Queryable {
  constructor(private txSql: any) {}

  async query<T = Row>(sql: string, params?: any[]): Promise<T[]> {
    const result = params && params.length > 0
      ? await this.txSql.unsafe(sql, params)
      : await this.txSql.unsafe(sql);
    return [...result] as T[];
  }

  async get<T = Row>(sql: string, params?: any[]): Promise<T | undefined> {
    const rows = await this.query<T>(sql, params);
    return rows[0];
  }

  async run(sql: string, params?: any[]): Promise<RunResult> {
    const result = params && params.length > 0
      ? await this.txSql.unsafe(sql, params)
      : await this.txSql.unsafe(sql);
    return {
      changes: result.count,
      lastInsertRowid: result.length > 0 && 'id' in result[0]
        ? (result[0] as any).id
        : undefined,
    };
  }

  async exec(sql: string): Promise<void> {
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await this.txSql.unsafe(statement);
    }
  }

  async transaction<T>(fn: (client: Queryable) => Promise<T>): Promise<T> {
    // Nested transactions are not supported by postgres; run sequentially.
    return fn(this);
  }
}

/**
 * PostgreSQL client wrapper that provides a similar shape to the previous
 * bun:sqlite API so the rest of the codebase can migrate incrementally.
 *
 * All database operations are async because the postgres driver is async.
 */

/**
 * Split a SQL script into statements on top-level semicolons.
 *
 * A plain `sql.split(';')` breaks anything containing a semicolon inside a
 * literal — most importantly a dollar-quoted function body:
 *
 *   CREATE FUNCTION f() RETURNS trigger AS $BODY$
 *   BEGIN PERFORM pg_notify('ch', ''); RETURN NULL; END;
 *   $BODY$ LANGUAGE plpgsql;
 *
 * splits into five fragments, none of them valid SQL, and Postgres reports
 * "unterminated dollar-quoted string" from somewhere in the middle of the
 * file. Triggers and stored procedures are unusable without this.
 */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let i = 0;

  while (i < sql.length) {
    const rest = sql.slice(i);

    // Dollar quoting: $tag$ ... $tag$, where tag may be empty. The closing
    // delimiter must match the opening tag exactly, so nested bodies using
    // different tags survive.
    const open = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(rest);
    if (open) {
      const tag = open[0];
      const end = sql.indexOf(tag, i + tag.length);
      // No closing tag: emit the remainder and let Postgres report it,
      // rather than silently truncating.
      const stop = end === -1 ? sql.length : end + tag.length;
      current += sql.slice(i, stop);
      i = stop;
      continue;
    }

    const ch = sql[i];

    if (ch === "'" || ch === '"') {
      // Standard SQL escaping doubles the quote character.
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === ch) {
          if (sql[j + 1] === ch) j += 2;
          else break;
        } else j++;
      }
      current += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    if (ch === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      const stop = nl === -1 ? sql.length : nl;
      current += sql.slice(i, stop);
      i = stop;
      continue;
    }

    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      current += sql.slice(i, stop);
      i = stop;
      continue;
    }

    if (ch === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  if (current.trim()) statements.push(current.trim());
  return statements;
}

export class PgClient implements Queryable {
  public readonly sql: Sql;

  constructor(url: string) {
    this.sql = postgres(url, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }

  async query<T = Row>(sql: string, params?: any[]): Promise<T[]> {
    const result = params && params.length > 0
      ? await this.sql.unsafe(sql, params)
      : await this.sql.unsafe(sql);
    return [...result] as T[];
  }

  async get<T = Row>(sql: string, params?: any[]): Promise<T | undefined> {
    const rows = await this.query<T>(sql, params);
    return rows[0];
  }

  async run(sql: string, params?: any[]): Promise<RunResult> {
    const result = params && params.length > 0
      ? await this.sql.unsafe(sql, params)
      : await this.sql.unsafe(sql);
    return {
      changes: result.count,
      lastInsertRowid: result.length > 0 && 'id' in result[0]
        ? (result[0] as any).id
        : undefined,
    };
  }

  async exec(sql: string): Promise<void> {
    for (const statement of splitStatements(sql)) {
      await this.sql.unsafe(statement);
    }
  }

  /**
   * Run a function inside a transaction.
   */
  async transaction<T>(fn: (client: Queryable) => Promise<T>): Promise<T> {
    return this.sql.begin((txSql) => fn(new TxClient(txSql))) as Promise<T>;
  }

  /**
   * Close the connection pool.
   */
  /**
   * Subscribe to a Postgres NOTIFY channel.
   *
   * Uses a dedicated connection, which is a requirement rather than a
   * preference: a listening connection cannot serve queries, so taking one
   * from the pool would permanently remove it from rotation.
   *
   * Delivery is best-effort by design — a NOTIFY issued while the listener is
   * reconnecting is simply lost. Callers must therefore treat this as a
   * latency optimisation over a periodic poll, never as the only path by
   * which work is discovered.
   */
  async listen(channel: string, onNotify: () => void): Promise<() => Promise<void>> {
    const subscription = await this.sql.listen(channel, () => onNotify());
    return async () => {
      await subscription.unlisten();
    };
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}

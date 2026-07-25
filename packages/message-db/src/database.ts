import { Database } from 'bun:sqlite';

/**
 * Options for the `select` query builder.
 */
export interface SelectOptions {
  where?: WhereCondition;
  order?: string;
  direction?: 'ASC' | 'DESC';
  fields?: string[];
  limit?: number;
  offset?: number;
  count?: boolean;
}

/**
 * A where condition can be:
 * - A simple equality: `{ field: value }`
 * - An array IN clause: `{ field: [1, 2, 3] }`
 * - A comparison: `{ field: { less_than: 5 } }`
 */
export type WhereCondition = Record<string, WhereValue>;
export type WhereValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | string[]
  | number[]
  | WhereOperator;

export interface WhereOperator {
  less_than?: number | string;
  greater_than?: number | string;
  less_than_or_equal_to?: number | string;
  greater_than_or_equal_to?: number | string;
}

export interface PaginationResult<T> {
  total: number;
  records: T[];
  page: number;
  per_page: number;
  total_pages: number;
}

/**
 * Low-level database wrapper for MessageDB.
 *
 * Provides select/insert/update/delete with parameterized queries,
 * pagination, and safe SQL construction.
 *
 * Each server gets its own SQLite file via this wrapper.
 * All queries use parameterized binding to prevent SQL injection.
 */
export class MessageDatabase {
  public readonly db: Database;
  public readonly serverId: number;

  constructor(db: Database, serverId: number) {
    this.db = db;
    this.serverId = serverId;
  }

  /**
   * Select records from a table.
   */
  select<T = Record<string, unknown>>(
    table: string,
    options: SelectOptions = {},
  ): T[] | number {
    const parts: string[] = [];

    if (options.count) {
      parts.push('SELECT COUNT(*) AS count');
    } else if (options.fields && options.fields.length > 0) {
      parts.push(`SELECT ${options.fields.map((f) => `"${sanitizeIdentifier(f)}"`).join(', ')}`);
    } else {
      parts.push('SELECT *');
    }

    parts.push(`FROM "${sanitizeIdentifier(table)}"`);

    const params: any[] = [];
    if (options.where) {
      const whereClause = buildWhereClause(options.where, params);
      if (whereClause) {
        parts.push(`WHERE ${whereClause}`);
      }
    }

    if (options.order) {
      const dir = options.direction === 'DESC' ? 'DESC' : 'ASC';
      parts.push(`ORDER BY "${sanitizeIdentifier(options.order)}" ${dir}`);
    }

    if (options.limit) {
      parts.push(`LIMIT ${options.limit}`);
    }

    if (options.offset) {
      parts.push(`OFFSET ${options.offset}`);
    }

    const sql = parts.join(' ');
    const stmt = this.db.query(sql);

    if (options.count) {
      const row = stmt.get(...params) as { count: number } | undefined;
      return row?.count ?? 0;
    }

    return stmt.all(...params) as T[];
  }

  /**
   * Paginated select — returns total count, records, and page metadata.
   */
  selectWithPagination<T = Record<string, unknown>>(
    table: string,
    page: number,
    options: Omit<SelectOptions, 'offset'> = {},
  ): PaginationResult<T> {
    const perPage = options.limit ?? 30;
    const actualPage = Math.max(1, page);
    const offset = (actualPage - 1) * perPage;

    const total = this.select<{ count: number }>(table, {
      ...options,
      count: true,
      fields: undefined,
      order: undefined,
      direction: undefined,
    }) as number;

    const records = this.select<T>(table, {
      ...options,
      limit: perPage,
      offset,
    }) as T[];

    const totalPages = Math.ceil(total / perPage);

    return {
      total,
      records,
      page: actualPage,
      per_page: perPage,
      total_pages: totalPages,
    };
  }

  /**
   * Update records in a table.
   * Returns the number of affected rows.
   */
  update(
    table: string,
    attributes: Record<string, unknown>,
    options: { where?: WhereCondition } = {},
  ): number {
    const setClauses: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(attributes)) {
      setClauses.push(`"${sanitizeIdentifier(key)}" = ?`);
      params.push(convertValue(value));
    }

    const parts: string[] = [];
    parts.push(`UPDATE "${sanitizeIdentifier(table)}"`);
    parts.push(`SET ${setClauses.join(', ')}`);

    if (options.where) {
      const whereClause = buildWhereClause(options.where, params);
      if (whereClause) {
        parts.push(`WHERE ${whereClause}`);
      }
    }

    const sql = parts.join(' ');
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);
    return result.changes;
  }

  /**
   * Insert a record into a table.
   * Returns the new row ID.
   */
  insert(table: string, attributes: Record<string, unknown>): number {
    const keys = Object.keys(attributes);
    const values = keys.map((k) => convertValue(attributes[k]));

    const sql = `INSERT INTO "${sanitizeIdentifier(table)}" (` +
      keys.map((k) => `"${sanitizeIdentifier(k)}"`).join(', ') +
      ') VALUES (' +
      keys.map(() => '?').join(', ') +
      ')';

    const stmt = this.db.prepare(sql);
    const result = stmt.run(...values);
    return Number(result.lastInsertRowid);
  }

  /**
   * Insert multiple rows in a single query.
   */
  insertMulti(
    table: string,
    keys: string[],
    rows: any[][],
  ): void {
    if (rows.length === 0) return;

    const placeholders = rows.map(() => `(${keys.map(() => '?').join(', ')})`).join(', ');
    const values = rows.flatMap((row) => row.map(convertValue));

    const sql = `INSERT INTO "${sanitizeIdentifier(table)}" (` +
      keys.map((k) => `"${sanitizeIdentifier(k)}"`).join(', ') +
      `) VALUES ${placeholders}`;

    const stmt = this.db.prepare(sql);
    stmt.run(...values);
  }

  /**
   * Delete records from a table.
   * Returns the number of affected rows.
   */
  delete(
    table: string,
    options: { where?: WhereCondition } = {},
  ): number {
    const parts: string[] = [];
    parts.push(`DELETE FROM "${sanitizeIdentifier(table)}"`);

    const params: any[] = [];
    if (options.where) {
      const whereClause = buildWhereClause(options.where, params);
      if (whereClause) {
        parts.push(`WHERE ${whereClause}`);
      }
    }

    const sql = parts.join(' ');
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);
    return result.changes;
  }

  /**
   * Run a raw SQL query with optional parameters.
   */
  query<T = Record<string, unknown>>(sql: string, params?: any[]): T[] {
    if (params && params.length > 0) {
      return this.db.query(sql).all(...params) as T[];
    }
    return this.db.query(sql).all() as T[];
  }

  /**
   * Execute a raw SQL statement (no results).
   */
  exec(sql: string): void {
    this.db.exec(sql);
  }

  /**
   * Run a function inside a transaction.
   */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  /**
   * Get the total size of all stored raw messages.
   */
  totalSize(): number {
    const row = this.query<{ size: number | null }>(
      'SELECT COALESCE(SUM(size), 0) AS size FROM raw_message_sizes',
    );
    return row[0]?.size ?? 0;
  }
}

/**
 * Build a WHERE clause with parameterized values.
 */
function buildWhereClause(
  conditions: WhereCondition,
  params: any[],
  joiner: string = 'AND',
): string {
  const clauses: string[] = [];

  for (const [key, value] of Object.entries(conditions)) {
    const column = `"${sanitizeIdentifier(key)}"`;

    if (value === null) {
      clauses.push(`${column} IS NULL`);
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        clauses.push('1=0');
      } else {
        const placeholders = value.map(() => '?').join(', ');
        clauses.push(`${column} IN (${placeholders})`);
        params.push(...value.map(convertValue));
      }
    } else if (isWhereOperator(value)) {
      const op = value as WhereOperator;
      if (op.less_than !== undefined) {
        clauses.push(`${column} < ?`);
        params.push(convertValue(op.less_than));
      }
      if (op.greater_than !== undefined) {
        clauses.push(`${column} > ?`);
        params.push(convertValue(op.greater_than));
      }
      if (op.less_than_or_equal_to !== undefined) {
        clauses.push(`${column} <= ?`);
        params.push(convertValue(op.less_than_or_equal_to));
      }
      if (op.greater_than_or_equal_to !== undefined) {
        clauses.push(`${column} >= ?`);
        params.push(convertValue(op.greater_than_or_equal_to));
      }
      if (clauses.length === 0) {
        clauses.push('1=1');
      }
    } else {
      clauses.push(`${column} = ?`);
      params.push(convertValue(value));
    }
  }

  return clauses.join(` ${joiner} `);
}

function isWhereOperator(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.less_than !== undefined ||
    v.greater_than !== undefined ||
    v.less_than_or_equal_to !== undefined ||
    v.greater_than_or_equal_to !== undefined
  );
}

function convertValue(value: unknown): any {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (value === undefined || value === null) {
    return null;
  }
  return value;
}

function sanitizeIdentifier(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name)) {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_');
  }
  return name;
}

import type { Queryable } from '@posta/core';

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
 * Each server gets its own PostgreSQL schema, configured via the connection
 * search_path. All queries use parameterized binding to prevent SQL injection.
 */
export class MessageDatabase {
  public readonly db: Queryable;
  public readonly serverId: number;

  constructor(db: Queryable, serverId: number) {
    this.db = db;
    this.serverId = serverId;
  }

  /**
   * Select records from a table.
   */
  async select<T = Record<string, unknown>>(
    table: string,
    options: SelectOptions = {},
  ): Promise<T[] | number> {
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

    if (options.count) {
      const row = await this.db.get<{ count: number }>(sql, params);
      return row?.count ?? 0;
    }

    return this.db.query<T>(sql, params);
  }

  /**
   * Paginated select — returns total count, records, and page metadata.
   */
  async selectWithPagination<T = Record<string, unknown>>(
    table: string,
    page: number,
    options: Omit<SelectOptions, 'offset'> = {},
  ): Promise<PaginationResult<T>> {
    const perPage = options.limit ?? 30;
    const actualPage = Math.max(1, page);
    const offset = (actualPage - 1) * perPage;

    const total = await this.select<{ count: number }>(table, {
      ...options,
      count: true,
      fields: undefined,
      order: undefined,
      direction: undefined,
    }) as number;

    const records = await this.select<T>(table, {
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
  async update(
    table: string,
    attributes: Record<string, unknown>,
    options: { where?: WhereCondition } = {},
  ): Promise<number> {
    const setClauses: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(attributes)) {
      setClauses.push(`"${sanitizeIdentifier(key)}" = $${params.length + 1}`);
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
    const result = await this.db.run(sql, params);
    return result.changes;
  }

  /**
   * Insert a record into a table.
   * Returns the new row ID.
   */
  async insert(table: string, attributes: Record<string, unknown>): Promise<number> {
    const keys = Object.keys(attributes);
    const values = keys.map((k) => convertValue(attributes[k]));

    const sql = `INSERT INTO "${sanitizeIdentifier(table)}" (` +
      keys.map((k) => `"${sanitizeIdentifier(k)}"`).join(', ') +
      ') VALUES (' +
      keys.map((_, i) => `$${i + 1}`).join(', ') +
      ') RETURNING id';

    const result = await this.db.run(sql, values);
    return Number(result.lastInsertRowid);
  }

  /**
   * Insert multiple rows in a single query.
   */
  async insertMulti(
    table: string,
    keys: string[],
    rows: any[][],
  ): Promise<void> {
    if (rows.length === 0) return;

    const params: any[] = [];
    const placeholders: string[] = [];
    for (const row of rows) {
      const rowPlaceholders: string[] = [];
      for (const value of row) {
        params.push(convertValue(value));
        rowPlaceholders.push(`$${params.length}`);
      }
      placeholders.push(`(${rowPlaceholders.join(', ')})`);
    }

    const sql = `INSERT INTO "${sanitizeIdentifier(table)}" (` +
      keys.map((k) => `"${sanitizeIdentifier(k)}"`).join(', ') +
      `) VALUES ${placeholders.join(', ')}`;

    await this.db.run(sql, params);
  }

  /**
   * Delete records from a table.
   * Returns the number of affected rows.
   */
  async delete(
    table: string,
    options: { where?: WhereCondition } = {},
  ): Promise<number> {
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
    const result = await this.db.run(sql, params);
    return result.changes;
  }

  /**
   * Run a raw SQL query with optional parameters.
   */
  async query<T = Record<string, unknown>>(sql: string, params?: any[]): Promise<T[]> {
    return this.db.query<T>(sql, params);
  }

  /**
   * Execute a parameterized SQL statement (no results).
   */
  async run(sql: string, params?: any[]): Promise<void> {
    await this.db.run(sql, params);
  }

  /**
   * Execute a raw SQL statement (no results).
   */
  async exec(sql: string): Promise<void> {
    await this.db.exec(sql);
  }

  /**
   * Run a function inside a transaction.
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.db.transaction(async () => fn());
  }

  /**
   * Get the total size of all stored raw messages.
   */
  async totalSize(): Promise<number> {
    const row = await this.db.get<{ size: number | null }>(
      'SELECT COALESCE(SUM(size), 0) AS size FROM raw_message_sizes',
    );
    return row?.size ?? 0;
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
        const placeholders = value.map((v) => {
          params.push(convertValue(v));
          return `$${params.length}`;
        });
        clauses.push(`${column} IN (${placeholders.join(', ')})`);
      }
    } else if (isWhereOperator(value)) {
      const op = value as WhereOperator;
      if (op.less_than !== undefined) {
        params.push(convertValue(op.less_than));
        clauses.push(`${column} < $${params.length}`);
      }
      if (op.greater_than !== undefined) {
        params.push(convertValue(op.greater_than));
        clauses.push(`${column} > $${params.length}`);
      }
      if (op.less_than_or_equal_to !== undefined) {
        params.push(convertValue(op.less_than_or_equal_to));
        clauses.push(`${column} <= $${params.length}`);
      }
      if (op.greater_than_or_equal_to !== undefined) {
        params.push(convertValue(op.greater_than_or_equal_to));
        clauses.push(`${column} >= $${params.length}`);
      }
      if (clauses.length === 0) {
        clauses.push('1=1');
      }
    } else {
      params.push(convertValue(value));
      clauses.push(`${column} = $${params.length}`);
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

import type { MessageDatabase, WhereCondition } from './database';

/**
 * Message record from the database.
 */
export interface MessageRecord {
  id?: number;
  token?: string;
  scope?: string;
  rcpt_to?: string;
  mail_from?: string;
  subject?: string;
  message_id?: string;
  timestamp?: number;
  route_id?: number;
  domain_id?: number;
  credential_id?: number;
  status?: string;
  held?: boolean;
  size?: string;
  last_delivery_attempt?: number;
  raw_table?: string;
  raw_body_id?: number;
  raw_headers_id?: number;
  inspected?: boolean;
  spam?: boolean;
  spam_score?: number;
  threat?: boolean;
  threat_details?: string;
  bounce?: boolean;
  bounce_for_id?: number;
  tag?: string;
  loaded?: number;
  clicked?: number;
  received_with_ssl?: boolean;
  hold_expiry?: number;
  tracked_links?: number;
  tracked_images?: number;
  parsed?: boolean;
  endpoint_id?: number;
  endpoint_type?: string;
}

/**
 * Message query options mirroring Ruby MessageDB's select options.
 */
export interface MessageQueryOptions {
  where?: WhereCondition;
  order?: string;
  direction?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}

/**
 * Message CRUD operations — mirrors the Ruby Message class.
 */
export class MessageStore {
  private db: MessageDatabase;

  constructor(db: MessageDatabase) {
    this.db = db;
  }

  /**
   * Find a single message by ID or conditions.
   */
  findOne(query: number | WhereCondition): MessageRecord {
    const conditions: WhereCondition = typeof query === 'number' ? { id: query } : query;
    const rows = this.db.select<MessageRecord>('messages', {
      where: conditions,
      limit: 1,
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new NotFoundError(`No message found matching query ${JSON.stringify(query)}`);
    }
    return rows[0];
  }

  /**
   * Find multiple messages matching options.
   */
  find(options: MessageQueryOptions = {}): MessageRecord[] {
    const result = this.db.select<MessageRecord>('messages', {
      where: options.where,
      order: options.order,
      direction: options.direction,
      limit: options.limit,
      offset: options.offset,
    });
    return Array.isArray(result) ? result : [];
  }

  /**
   * Find messages with pagination.
   */
  findWithPagination(page: number, options: MessageQueryOptions = {}) {
    return this.db.selectWithPagination<MessageRecord>('messages', page, {
      where: options.where,
      order: options.order,
      direction: options.direction,
      limit: options.limit,
    });
  }

  /**
   * Create a new message record.
   */
  create(attributes: Partial<MessageRecord>): number {
    const record = {
      ...attributes,
      timestamp: attributes.timestamp ?? Date.now() / 1000,
    };
    return this.db.insert('messages', record);
  }

  /**
   * Update a message by ID.
   */
  update(id: number, attributes: Partial<MessageRecord>): number {
    return this.db.update('messages', attributes, { where: { id } });
  }

  /**
   * Delete a message by ID.
   */
  delete(id: number): number {
    return this.db.delete('messages', { where: { id } });
  }

  /**
   * Insert a raw message (headers + body) into a daily partitioned table.
   * Returns the table name, headers_id, body_id.
   */
  insertRawMessage(
    data: Buffer | string,
    date: Date = new Date(),
  ): { tableName: string; headersId: number; bodyId: number } {
    const dateStr = date.toISOString().slice(0, 10);
    const tableName = `raw-${dateStr}`;

    // Split headers and body
    const str = typeof data === 'string' ? data : data.toString('binary');
    const separatorIndex = str.search(/\r?\n\r?\n/);
    let headers: string;
    let body: string;
    if (separatorIndex >= 0) {
      headers = str.slice(0, separatorIndex);
      body = str.slice(separatorIndex + str.match(/\r?\n\r?\n/)![0].length);
    } else {
      headers = str;
      body = '';
    }

    // Ensure the raw table exists
    this.ensureRawTable(tableName);

    const headersId = this.db.insert(tableName, { data: headers });
    const bodyId = this.db.insert(tableName, { data: body });

    // Update size tracking
    const size = Buffer.byteLength(str, 'utf-8');
    this.db.exec(
      `UPDATE raw_message_sizes SET size = COALESCE(size, 0) + ${size} WHERE table_name = '${tableName}'`,
    );

    return { tableName, headersId, bodyId };
  }

  /**
   * Ensure a raw message table exists for the given date.
   */
  private ensureRawTable(tableName: string): void {
    // Check if table exists
    const tables = this.db.query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [tableName],
    );
    if (tables.length === 0) {
      this.db.exec(`
        CREATE TABLE "${tableName}" (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          data BLOB,
          next INTEGER
        )
      `);
      this.db.insert('raw_message_sizes', { table_name: tableName, size: 0 });
    }
  }

  /**
   * Fetch raw headers for a message.
   */
  getRawHeaders(message: MessageRecord): string {
    if (!message.raw_table || !message.raw_headers_id) return '';
    const rows = this.db.query<{ data: string }>(
      `SELECT data FROM "${message.raw_table}" WHERE id = ?`,
      [message.raw_headers_id],
    );
    return rows[0]?.data ?? '';
  }

  /**
   * Fetch raw body for a message.
   */
  getRawBody(message: MessageRecord): string {
    if (!message.raw_table || !message.raw_body_id) return '';
    const rows = this.db.query<{ data: string }>(
      `SELECT data FROM "${message.raw_table}" WHERE id = ?`,
      [message.raw_body_id],
    );
    return rows[0]?.data ?? '';
  }

  /**
   * Get full raw message (headers + body).
   */
  getRawMessage(message: MessageRecord): string {
    const headers = this.getRawHeaders(message);
    const body = this.getRawBody(message);
    return `${headers}\r\n\r\n${body}`;
  }

  /**
   * Append headers to the raw headers of a message.
   */
  appendHeaders(message: MessageRecord, ...headers: string[]): void {
    const newHeaders = headers.join('\r\n');
    const existingHeaders = this.getRawHeaders(message);
    const combined = `${newHeaders}\r\n${existingHeaders}`;
    if (message.raw_table && message.raw_headers_id) {
      const stmt = this.db.db.prepare(
        `UPDATE "${message.raw_table}" SET data = ? WHERE id = ?`,
      );
      stmt.run(combined, message.raw_headers_id);
    }
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

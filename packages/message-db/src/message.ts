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
  async findOne(query: number | WhereCondition): Promise<MessageRecord> {
    const conditions: WhereCondition = typeof query === 'number' ? { id: query } : query;
    const rows = await this.db.select<MessageRecord>('messages', {
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
  async find(options: MessageQueryOptions = {}): Promise<MessageRecord[]> {
    const result = await this.db.select<MessageRecord>('messages', {
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
  async findWithPagination(page: number, options: MessageQueryOptions = {}) {
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
  async create(attributes: Partial<MessageRecord>): Promise<number> {
    const record = {
      ...attributes,
      timestamp: attributes.timestamp ?? Date.now() / 1000,
    };
    return this.db.insert('messages', record);
  }

  /**
   * Update a message by ID.
   */
  async update(id: number, attributes: Partial<MessageRecord>): Promise<number> {
    return this.db.update('messages', attributes, { where: { id } });
  }

  /**
   * Delete a message by ID.
   */
  async delete(id: number): Promise<number> {
    return this.db.delete('messages', { where: { id } });
  }

  /**
   * Insert a raw message (headers + body) into a daily partitioned table.
   * Returns the table name, headers_id, body_id.
   */
  async insertRawMessage(
    data: Buffer | string,
    date: Date = new Date(),
  ): Promise<{ tableName: string; headersId: number; bodyId: number }> {
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
    await this.ensureRawTable(tableName);

    const headersId = await this.db.insert(tableName, { data: Buffer.from(headers, 'binary') });
    const bodyId = await this.db.insert(tableName, { data: Buffer.from(body, 'binary') });

    // Update size tracking
    const size = Buffer.byteLength(str, 'utf-8');
    await this.db.exec(
      `UPDATE raw_message_sizes SET size = COALESCE(size, 0) + ${size} WHERE table_name = '${tableName}'`,
    );

    return { tableName, headersId, bodyId };
  }

  /**
   * Ensure a raw message table exists for the given date.
   */
  private async ensureRawTable(tableName: string): Promise<void> {
    // Check if table exists
    const tables = await this.db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name = $1`,
      [tableName],
    );
    if (tables.length === 0) {
      await this.db.exec(`
        CREATE TABLE "${tableName}" (
          id SERIAL PRIMARY KEY,
          data BYTEA,
          next INTEGER
        )
      `);
      await this.db.insert('raw_message_sizes', { table_name: tableName, size: 0 });
    }
  }

  /**
   * Fetch raw headers for a message.
   */
  async getRawHeaders(message: MessageRecord): Promise<string> {
    if (!message.raw_table || !message.raw_headers_id) return '';
    const rows = await this.db.query<{ data: Buffer }>(
      `SELECT data FROM "${message.raw_table}" WHERE id = $1`,
      [message.raw_headers_id],
    );
    const data = rows[0]?.data;
    return data ? data.toString('binary') : '';
  }

  /**
   * Fetch raw body for a message.
   */
  async getRawBody(message: MessageRecord): Promise<string> {
    if (!message.raw_table || !message.raw_body_id) return '';
    const rows = await this.db.query<{ data: Buffer }>(
      `SELECT data FROM "${message.raw_table}" WHERE id = $1`,
      [message.raw_body_id],
    );
    const data = rows[0]?.data;
    return data ? data.toString('binary') : '';
  }

  /**
   * Get full raw message (headers + body).
   */
  async getRawMessage(message: MessageRecord): Promise<string> {
    const headers = await this.getRawHeaders(message);
    const body = await this.getRawBody(message);
    return `${headers}\r\n\r\n${body}`;
  }

  /**
   * Append headers to the raw headers of a message.
   */
  async appendHeaders(message: MessageRecord, ...headers: string[]): Promise<void> {
    const newHeaders = headers.join('\r\n');
    const existingHeaders = await this.getRawHeaders(message);
    const combined = `${newHeaders}\r\n${existingHeaders}`;
    if (message.raw_table && message.raw_headers_id) {
      await this.db.db.run(
        `UPDATE "${message.raw_table}" SET data = $1 WHERE id = $2`,
        [Buffer.from(combined, 'binary'), message.raw_headers_id],
      );
    }
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

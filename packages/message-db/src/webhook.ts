import type { MessageDatabase } from './database';

/**
 * Webhook request record from the database.
 */
export interface WebhookRequestRecord {
  id?: number;
  uuid?: string;
  event?: string;
  attempt?: number;
  timestamp?: number;
  status_code?: number;
  body?: string;
  payload?: string;
  will_retry?: boolean;
  url?: string;
  webhook_id?: number;
}

/**
 * Webhook request management.
 */
export class WebhookStore {
  private db: MessageDatabase;

  constructor(db: MessageDatabase) {
    this.db = db;
  }

  /**
   * Record a webhook request.
   */
  async record(attributes: Partial<WebhookRequestRecord>): Promise<number> {
    return this.db.insert('webhook_requests', {
      ...attributes,
      timestamp: attributes.timestamp ?? Date.now() / 1000,
    });
  }

  /**
   * List webhook requests with pagination.
   */
  async list(page: number = 1) {
    return this.db.selectWithPagination<WebhookRequestRecord>(
      'webhook_requests',
      page,
      { order: 'timestamp', direction: 'DESC' },
    );
  }

  /**
   * Find a webhook request by UUID.
   */
  async find(uuid: string): Promise<WebhookRequestRecord> {
    const rows = await this.db.select<WebhookRequestRecord>('webhook_requests', {
      where: { uuid },
      limit: 1,
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new WebhookNotFoundError(`No request found with UUID '${uuid}'`);
    }
    return rows[0];
  }

  /**
   * Prune old webhook requests (older than 10 days).
   */
  async prune(): Promise<number> {
    const cutoff = (Date.now() / 1000) - (10 * 86400);
    const last = await this.db.select<{ id: number }>('webhook_requests', {
      where: { timestamp: { less_than: cutoff } },
      order: 'timestamp',
      direction: 'DESC',
      limit: 1,
      fields: ['id'],
    }) as { id: number }[];

    if (last.length === 0) return 0;
    return this.db.delete('webhook_requests', {
      where: { id: { less_than_or_equal_to: last[0].id } },
    });
  }
}

export class WebhookNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookNotFoundError';
  }
}

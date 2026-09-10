import type { MessageDatabase } from './database';

/**
 * Load (image open) record from the database.
 */
export interface LoadRecord {
  id?: number;
  message_id?: number;
  ip_address?: string;
  country?: string;
  city?: string;
  user_agent?: string;
  timestamp?: number;
}

/**
 * Load (image open) tracking.
 */
export class LoadStore {
  private db: MessageDatabase;

  constructor(db: MessageDatabase) {
    this.db = db;
  }

  /**
   * Create a load record.
   */
  async create(attributes: Partial<LoadRecord>): Promise<number> {
    return this.db.insert('loads', {
      ...attributes,
      timestamp: attributes.timestamp ?? Date.now() / 1000,
    });
  }

  /**
   * Get all loads for a message.
   */
  async forMessage(messageId: number): Promise<LoadRecord[]> {
    const result = await this.db.select<LoadRecord>('loads', {
      where: { message_id: messageId },
      order: 'timestamp',
    });
    return Array.isArray(result) ? result : [];
  }
}

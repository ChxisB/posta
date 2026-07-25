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
 * Load (image open) tracking — mirrors Ruby Load class.
 */
export class LoadStore {
  private db: MessageDatabase;

  constructor(db: MessageDatabase) {
    this.db = db;
  }

  /**
   * Create a load record.
   */
  create(attributes: Partial<LoadRecord>): number {
    return this.db.insert('loads', {
      ...attributes,
      timestamp: attributes.timestamp ?? Date.now() / 1000,
    });
  }

  /**
   * Get all loads for a message.
   */
  forMessage(messageId: number): LoadRecord[] {
    const result = this.db.select<LoadRecord>('loads', {
      where: { message_id: messageId },
      order: 'timestamp',
    });
    return Array.isArray(result) ? result : [];
  }
}

import type { MessageDatabase } from './database';

/**
 * Spam check record from the database.
 */
export interface SpamCheckRecord {
  id?: number;
  message_id?: number;
  score?: number;
  code?: string;
  description?: string;
}

/**
 * Spam check results — mirrors the Ruby spam check system.
 */
export class SpamCheckStore {
  private db: MessageDatabase;

  constructor(db: MessageDatabase) {
    this.db = db;
  }

  /**
   * Record a spam check result for a message.
   */
  create(attributes: Partial<SpamCheckRecord>): number {
    return this.db.insert('spam_checks', attributes);
  }

  /**
   * Get all spam checks for a message.
   */
  forMessage(messageId: number): SpamCheckRecord[] {
    const result = this.db.select<SpamCheckRecord>('spam_checks', {
      where: { message_id: messageId },
    });
    return Array.isArray(result) ? result : [];
  }
}

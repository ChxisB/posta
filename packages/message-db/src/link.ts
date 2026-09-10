import crypto from 'node:crypto';
import type { MessageDatabase } from './database';

/**
 * Link record from the database.
 */
export interface LinkRecord {
  id?: number;
  message_id?: number;
  token?: string;
  hash?: string;
  url?: string;
  timestamp?: number;
}

/**
 * Link tracking — manages tracked URLs in messages.
 */
export class LinkStore {
  private db: MessageDatabase;

  constructor(db: MessageDatabase) {
    this.db = db;
  }

  /**
   * Create a tracked link for a message.
   * Returns the link token.
   */
  async create(messageId: number, url: string): Promise<string> {
    const hash = crypto.createHash('sha1').update(url).digest('hex');
    const token = crypto.randomBytes(16).toString('base64url');
    await this.db.insert('links', {
      message_id: messageId,
      hash,
      url,
      timestamp: Date.now() / 1000,
      token,
    });
    return token;
  }

  /**
   * Find a link by its token.
   */
  async findByToken(token: string): Promise<LinkRecord | undefined> {
    const rows = await this.db.select<LinkRecord>('links', {
      where: { token },
      limit: 1,
    });
    return Array.isArray(rows) ? rows[0] : undefined;
  }

  /**
   * Find links by message ID.
   */
  async forMessage(messageId: number): Promise<LinkRecord[]> {
    const result = await this.db.select<LinkRecord>('links', {
      where: { message_id: messageId },
      order: 'timestamp',
    });
    return Array.isArray(result) ? result : [];
  }
}

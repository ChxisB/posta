import type { MessageDatabase } from './database';

/**
 * Click record from the database.
 */
export interface ClickRecord {
  id?: number;
  message_id?: number;
  link_id?: number;
  ip_address?: string;
  country?: string;
  city?: string;
  user_agent?: string;
  timestamp?: number;
}

export interface ClickWithLink extends ClickRecord {
  url?: string;
}

/**
 * Click tracking — mirrors Ruby Click class.
 */
export class ClickStore {
  private db: MessageDatabase;

  constructor(db: MessageDatabase) {
    this.db = db;
  }

  /**
   * Create a click record.
   */
  create(attributes: Partial<ClickRecord>): number {
    return this.db.insert('clicks', {
      ...attributes,
      timestamp: attributes.timestamp ?? Date.now() / 1000,
    });
  }

  /**
   * Get all clicks for a message.
   */
  forMessage(messageId: number): ClickWithLink[] {
    const result = this.db.select<ClickRecord>('clicks', {
      where: { message_id: messageId },
      order: 'timestamp',
    });
    const clicks = Array.isArray(result) ? result : [];

    if (clicks.length === 0) return [];

    // Fetch associated links
    const linkIds = clicks.map((c) => c.link_id).filter(Boolean) as number[];
    if (linkIds.length === 0) return clicks as ClickWithLink[];

    const links = this.db.query<{ id: number; url: string }>(
      `SELECT id, url FROM links WHERE id IN (${linkIds.join(',')})`,
    );
    const linkMap = new Map(links.map((l) => [l.id, l.url]));

    return clicks.map((c) => ({
      ...c,
      url: c.link_id ? linkMap.get(c.link_id) : undefined,
    }));
  }
}

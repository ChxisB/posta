import type { MessageDatabase } from './database';

/**
 * Suppression record from the database.
 */
export interface SuppressionRecord {
  id?: number;
  type?: string;
  address?: string;
  reason?: string;
  timestamp?: number;
  keep_until?: number;
}

/**
 * Suppression list management.
 */
export class SuppressionStore {
  private db: MessageDatabase;

  constructor(db: MessageDatabase) {
    this.db = db;
  }

  /**
   * Add an address to the suppression list.
   */
  async add(
    type: string,
    address: string,
    options: { days?: number; reason?: string } = {},
  ): Promise<boolean> {
    const keepUntil = (Date.now() / 1000) + ((options.days ?? 30) * 86400);
    const existing = await this.db.select<SuppressionRecord>('suppressions', {
      where: { type, address },
      limit: 1,
    });

    if (Array.isArray(existing) && existing.length > 0) {
      const record = existing[0];
      await this.db.update('suppressions', {
        reason: options.reason ?? record.reason,
        keep_until: keepUntil,
      }, { where: { id: record.id! } });
    } else {
      await this.db.insert('suppressions', {
        type,
        address,
        reason: options.reason,
        timestamp: Date.now() / 1000,
        keep_until: keepUntil,
      });
    }
    return true;
  }

  /**
   * Check if an address is suppressed.
   */
  async get(type: string, address: string): Promise<SuppressionRecord | undefined> {
    const rows = await this.db.select<SuppressionRecord>('suppressions', {
      where: {
        type,
        address,
        keep_until: { greater_than_or_equal_to: Date.now() / 1000 },
      },
      limit: 1,
    });
    return Array.isArray(rows) ? rows[0] : undefined;
  }

  /**
   * List suppressions with pagination.
   */
  async listWithPagination(page: number) {
    return this.db.selectWithPagination<SuppressionRecord>(
      'suppressions',
      page,
      { order: 'timestamp', direction: 'DESC' },
    );
  }

  /**
   * Remove a suppression.
   */
  async remove(type: string, address: string): Promise<boolean> {
    const changes = await this.db.delete('suppressions', { where: { type, address } });
    return changes > 0;
  }

  /**
   * Prune expired suppressions.
   */
  async prune(): Promise<number> {
    return this.db.delete('suppressions', {
      where: { keep_until: { less_than: Date.now() / 1000 } },
    });
  }
}

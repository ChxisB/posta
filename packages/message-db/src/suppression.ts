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
 * Suppression list management — mirrors Ruby SuppressionList class.
 */
export class SuppressionStore {
  private db: MessageDatabase;

  constructor(db: MessageDatabase) {
    this.db = db;
  }

  /**
   * Add an address to the suppression list.
   */
  add(
    type: string,
    address: string,
    options: { days?: number; reason?: string } = {},
  ): boolean {
    const keepUntil = (Date.now() / 1000) + ((options.days ?? 30) * 86400);
    const existing = this.db.select<SuppressionRecord>('suppressions', {
      where: { type, address },
      limit: 1,
    });

    if (Array.isArray(existing) && existing.length > 0) {
      const record = existing[0];
      this.db.update('suppressions', {
        reason: options.reason ?? record.reason,
        keep_until: keepUntil,
      }, { where: { id: record.id! } });
    } else {
      this.db.insert('suppressions', {
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
  get(type: string, address: string): SuppressionRecord | undefined {
    const rows = this.db.select<SuppressionRecord>('suppressions', {
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
  listWithPagination(page: number) {
    return this.db.selectWithPagination<SuppressionRecord>(
      'suppressions',
      page,
      { order: 'timestamp', direction: 'DESC' },
    );
  }

  /**
   * Remove a suppression.
   */
  remove(type: string, address: string): boolean {
    const changes = this.db.delete('suppressions', { where: { type, address } });
    return changes > 0;
  }

  /**
   * Prune expired suppressions.
   */
  prune(): number {
    return this.db.delete('suppressions', {
      where: { keep_until: { less_than: Date.now() / 1000 } },
    });
  }
}

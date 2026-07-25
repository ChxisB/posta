import { describe, it, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { MessageDatabase } from '../database';

function asArray<T>(result: T[] | number): T[] {
  return Array.isArray(result) ? result : [];
}

describe('MessageDatabase Integration', () => {
  it('creates a MessageDatabase and runs CRUD operations', () => {
    const db = new Database(':memory:');
    const msgDb = new MessageDatabase(db, 1);

    // Create a test table
    msgDb.exec(`
      CREATE TABLE test_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        value INTEGER,
        created_at REAL
      )
    `);

    // INSERT
    const id1 = msgDb.insert('test_items', { name: 'item1', value: 100, created_at: Date.now() / 1000 });
    const id2 = msgDb.insert('test_items', { name: 'item2', value: 200, created_at: Date.now() / 1000 });
    expect(id1).toBe(1);
    expect(id2).toBe(2);

    // SELECT
    const all = asArray(msgDb.select<any>('test_items'));
    expect(all.length).toBe(2);

    // SELECT with where
    const filtered = asArray(msgDb.select<any>('test_items', { where: { name: 'item1' } }));
    expect(filtered.length).toBe(1);
    expect(filtered[0].value).toBe(100);

    // SELECT with comparison
    const greater = asArray(msgDb.select<any>('test_items', {
      where: { value: { greater_than: 150 } },
    }));
    expect(greater.length).toBe(1);
    expect(greater[0].name).toBe('item2');

    // SELECT with count
    const count = msgDb.select('test_items', { count: true }) as number;
    expect(count).toBe(2);

    // SELECT with pagination
    const page1 = msgDb.selectWithPagination<any>('test_items', 1, { limit: 1 });
    expect(page1.total).toBe(2);
    expect(page1.records.length).toBe(1);
    expect(page1.total_pages).toBe(2);
    expect(page1.page).toBe(1);

    // UPDATE
    const updated = msgDb.update('test_items', { value: 999 }, { where: { id: id1 } });
    expect(updated).toBe(1);

    const check = asArray(msgDb.select<any>('test_items', { where: { id: id1 } }));
    expect(check[0].value).toBe(999);

    // INSERT MULTI
    msgDb.insertMulti('test_items', ['name', 'value', 'created_at'], [
      ['item3', 300, Date.now() / 1000],
      ['item4', 400, Date.now() / 1000],
    ]);
    const allAfterMulti = asArray(msgDb.select<any>('test_items'));
    expect(allAfterMulti.length).toBe(4);

    // DELETE
    const deleted = msgDb.delete('test_items', { where: { id: id2 } });
    expect(deleted).toBe(1);

    const afterDelete = asArray(msgDb.select<any>('test_items'));
    expect(afterDelete.length).toBe(3);

    // TRANSACTION
    msgDb.transaction(() => {
      msgDb.insert('test_items', { name: 'tx-item', value: 500 });
      msgDb.insert('test_items', { name: 'tx-item2', value: 600 });
    });

    const afterTx = asArray(msgDb.select<any>('test_items'));
    expect(afterTx.length).toBe(5);

    // QUERY helper — debug the values
    const allRows = msgDb.db.query('SELECT name, value FROM test_items ORDER BY id').all() as any[];
    const countAfter350 = allRows.filter((r: any) => r.value > 350).length;

    const bareResults = msgDb.db.query('SELECT * FROM test_items WHERE value > ?').all(350) as any[];
    expect(bareResults.length).toBe(countAfter350);

    // Then test with inline value (no parameter binding)
    const results = msgDb.query<any>(`SELECT * FROM test_items WHERE value > 350`);
    expect(results.length).toBe(countAfter350);

    db.close();
  });
});

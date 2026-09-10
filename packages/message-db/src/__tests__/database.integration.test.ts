import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { PgClient } from '@posta/core';
import { MessageDatabase } from '../database';

/**
 * Integration tests for MessageDatabase.
 *
 * These require a running PostgreSQL database. Set POSTA_MAIN_DB_URL to a test
 * database before running.
 */
const testDbUrl = process.env.POSTA_MAIN_DB_URL || 'postgresql://postgres:postgres@localhost:5432/posta_test';
const testSchema = 'message_db_test';

describe('MessageDatabase Integration', () => {
  let client: PgClient;
  let msgDb: MessageDatabase;

  beforeAll(async () => {
    client = new PgClient(testDbUrl);
    await client.run(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
    await client.run(`CREATE SCHEMA "${testSchema}"`);
    await client.run(`SET search_path TO "${testSchema}"`);
    msgDb = new MessageDatabase(client, 1);
  });

  afterAll(async () => {
    await client.run(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
    await client.close();
  });

  it('creates a MessageDatabase and runs CRUD operations', async () => {
    // Create a test table
    await msgDb.exec(`
      CREATE TABLE test_items (
        id SERIAL PRIMARY KEY,
        name TEXT,
        value INTEGER,
        created_at REAL
      )
    `);

    // INSERT
    const id1 = await msgDb.insert('test_items', { name: 'item1', value: 100, created_at: Date.now() / 1000 });
    const id2 = await msgDb.insert('test_items', { name: 'item2', value: 200, created_at: Date.now() / 1000 });
    expect(id1).toBeGreaterThan(0);
    expect(id2).toBeGreaterThan(id1);

    // SELECT
    const all = await msgDb.select<any>('test_items') as any[];
    expect(all.length).toBe(2);

    // SELECT with where
    const filtered = await msgDb.select<any>('test_items', { where: { name: 'item1' } }) as any[];
    expect(filtered.length).toBe(1);
    expect(filtered[0].value).toBe(100);

    // SELECT with comparison
    const greater = await msgDb.select<any>('test_items', {
      where: { value: { greater_than: 150 } },
    }) as any[];
    expect(greater.length).toBe(1);
    expect(greater[0].name).toBe('item2');

    // SELECT with count
    const count = await msgDb.select('test_items', { count: true }) as number;
    expect(count).toBe(2);

    // SELECT with pagination
    const page1 = await msgDb.selectWithPagination<any>('test_items', 1, { limit: 1 });
    expect(page1.total).toBe(2);
    expect(page1.records.length).toBe(1);
    expect(page1.total_pages).toBe(2);
    expect(page1.page).toBe(1);

    // UPDATE
    const updated = await msgDb.update('test_items', { value: 999 }, { where: { id: id1 } });
    expect(updated).toBe(1);

    const check = await msgDb.select<any>('test_items', { where: { id: id1 } }) as any[];
    expect(check[0].value).toBe(999);

    // INSERT MULTI
    await msgDb.insertMulti('test_items', ['name', 'value', 'created_at'], [
      ['item3', 300, Date.now() / 1000],
      ['item4', 400, Date.now() / 1000],
    ]);
    const allAfterMulti = await msgDb.select<any>('test_items') as any[];
    expect(allAfterMulti.length).toBe(4);

    // DELETE
    const deleted = await msgDb.delete('test_items', { where: { id: id2 } });
    expect(deleted).toBe(1);

    const afterDelete = await msgDb.select<any>('test_items') as any[];
    expect(afterDelete.length).toBe(3);

    // TRANSACTION
    await msgDb.transaction(async () => {
      await msgDb.insert('test_items', { name: 'tx-item', value: 500 });
      await msgDb.insert('test_items', { name: 'tx-item2', value: 600 });
    });

    const afterTx = await msgDb.select<any>('test_items') as any[];
    expect(afterTx.length).toBe(5);

    // QUERY helper
    const bareResults = await msgDb.db.query('SELECT * FROM test_items WHERE value > $1', [350]);
    expect(bareResults.length).toBeGreaterThan(0);

    const results = await msgDb.query<any>(`SELECT * FROM test_items WHERE value > 350`);
    expect(results.length).toBe(bareResults.length);
  });
});

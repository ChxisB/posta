import { PgClient } from '@posta/core';

const SERVER_URL = 'postgresql://postgres:postgres@localhost:5432';

/**
 * Create a fresh database for one test file and point the web-server's config
 * at it. getDb() creates the tables on first use, but not the database itself.
 */
export async function useTestDatabase(name: string): Promise<void> {
  const dbName = `posta_test_${name}_${Date.now()}`;
  const admin = new PgClient(`${SERVER_URL}/postgres`);
  try {
    await admin.exec(`CREATE DATABASE ${dbName}`);
  } finally {
    await admin.close();
  }

  process.env.POSTA_MAIN_DB_URL = `${SERVER_URL}/${dbName}`;
  process.env.POSTA_MESSAGE_DB_URL = `${SERVER_URL}/${dbName}`;
  process.env.POSTA_CONFIG_FILE_PATH = '/dev/null';
}

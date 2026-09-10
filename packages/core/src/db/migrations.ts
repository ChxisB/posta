import type { Queryable } from './client';

export interface Migration {
  version: number;
  name: string;
  up: (client: Queryable) => Promise<void>;
}

/**
 * Run pending migrations against a database.
 * Tracks applied migrations in a `schema_migrations` table.
 */
export async function runMigrations(client: Queryable, migrations: Migration[]): Promise<void> {
  // Ensure the migrations tracking table exists
  await client.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Get already-applied versions
  const applied = new Set<number>();
  const rows = await client.query<{ version: number }>('SELECT version FROM schema_migrations');
  for (const row of rows) {
    applied.add(row.version);
  }

  // Sort migrations by version and apply pending ones
  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  for (const migration of sorted) {
    if (applied.has(migration.version)) continue;

    console.log(`[migration] Applying v${migration.version}: ${migration.name}`);

    await client.transaction(async () => {
      await migration.up(client);
      await client.run(
        'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
        [migration.version, migration.name],
      );
    });

    console.log(`[migration] Applied v${migration.version}`);
  }
}

/**
 * Get the current schema migration version.
 * Returns 0 if no migrations have been applied.
 */
export async function getMigrationVersion(client: Queryable): Promise<number> {
  try {
    const row = await client.get<{ version: number | null }>(
      'SELECT MAX(version) as version FROM schema_migrations',
    );
    return row?.version ?? 0;
  } catch {
    return 0;
  }
}

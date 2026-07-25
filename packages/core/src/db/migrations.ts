import { Database } from 'bun:sqlite';

export interface Migration {
  version: number;
  name: string;
  up: (db: Database) => void;
}

/**
 * Run pending migrations against a database.
 * Tracks applied migrations in a `schema_migrations` table.
 */
export function runMigrations(db: Database, migrations: Migration[]): void {
  // Ensure the migrations tracking table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Get already-applied versions
  const applied = new Set<number>();
  const rows = db.query('SELECT version FROM schema_migrations').all() as { version: number }[];
  for (const row of rows) {
    applied.add(row.version);
  }

  // Sort migrations by version and apply pending ones
  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  for (const migration of sorted) {
    if (applied.has(migration.version)) continue;

    console.log(`[migration] Applying v${migration.version}: ${migration.name}`);

    db.transaction(() => {
      migration.up(db);
      db.run(
        'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
        [migration.version, migration.name],
      );
    })();

    console.log(`[migration] Applied v${migration.version}`);
  }
}

/**
 * Get the current schema migration version.
 * Returns 0 if no migrations have been applied.
 */
export function getMigrationVersion(db: Database): number {
  try {
    const row = db.query(
      'SELECT MAX(version) as version FROM schema_migrations',
    ).get() as { version: number | null } | undefined;
    return row?.version ?? 0;
  } catch {
    return 0;
  }
}

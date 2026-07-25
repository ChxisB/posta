import { loadConfig, initializeMainDb, type PostaConfig } from '@posta/core';
import { runJobs, runScheduledTasks } from './process';

const config = loadConfig();

// Initialize database before starting the worker
const mainDb = initializeMainDb(config);

// Ensure worker-specific tables exist
mainDb.exec(`
  CREATE TABLE IF NOT EXISTS worker_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL UNIQUE,
    worker TEXT,
    acquired_at TEXT
  )
`);
mainDb.exec(`
  CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    next_run_after TEXT
  )
`);

console.log('[worker] starting...');

// Start job threads
runJobs(config, { threadCount: 2, sleepTime: 5 });

// Start tasks thread
runScheduledTasks(config, { sleepTime: 60 });

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[worker] received SIGTERM, shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[worker] received SIGINT, shutting down...');
  process.exit(0);
});

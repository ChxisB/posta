import { loadConfig, initializeMainDb, type PostaConfig } from '@posta/core';
import { runJobs, runScheduledTasks } from './process';

const config = loadConfig();

// Initialize database before starting the worker
const mainDb = await initializeMainDb(config);

// Ensure worker-specific tables exist
await mainDb.exec(`
  CREATE TABLE IF NOT EXISTS worker_roles (
    id SERIAL PRIMARY KEY,
    role TEXT NOT NULL UNIQUE,
    worker TEXT,
    acquired_at TIMESTAMPTZ
  )
`);
await mainDb.exec(`
  CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    next_run_after TIMESTAMPTZ
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

import { loadConfig, initializeDatabase } from '@posta/core';
import { SmtpServer } from './server';
import { MessageQueuer } from './queue-message';

const config = loadConfig();

// Initialize database before starting the server
await initializeDatabase(config);

const server = new SmtpServer(config);

// Store and queue each received message; the worker delivers it
const queuer = new MessageQueuer(config);
server.onMessage = (msg) => queuer.queue(msg);

server.start();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[smtp-server] received SIGTERM, shutting down...');
  server.stop();
});

process.on('SIGINT', () => {
  console.log('[smtp-server] received SIGINT, shutting down...');
  server.stop();
});

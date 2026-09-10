import { loadConfig, initializeDatabase } from '@posta/core';
import { SmtpServer } from './server';
import { IncomingMessageHandler } from './incoming-handler';

const config = loadConfig();

// Initialize database before starting the server
await initializeDatabase(config);

const server = new SmtpServer(config);

// Wire incoming message handler
const incomingHandler = new IncomingMessageHandler(config);
server.onMessage = (msg) => incomingHandler.handle(msg);

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

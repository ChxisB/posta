#!/bin/bash
set -e

echo "Posta — starting all processes..."

# Ensure data directories exist
mkdir -p /data/message-db

# Run main DB schema (ensures tables exist)
if [ -f /app/packages/core/dist/index.js ]; then
  bun run --cwd /app/packages/core dist/index.js --migrate
fi

# Start all processes
echo "Starting web server (port ${PORT:-5000})..."
bun run --cwd /app/packages/web-server dist/index.js &
echo $! > /tmp/web-server.pid

echo "Starting SMTP server (port ${SMTP_PORT:-25})..."
bun run --cwd /app/packages/smtp-server dist/index.js &
echo $! > /tmp/smtp-server.pid

echo "Starting worker..."
bun run --cwd /app/packages/worker dist/index.js &
echo $! > /tmp/worker.pid

# Forward signals to children
trap 'kill $(cat /tmp/web-server.pid /tmp/smtp-server.pid /tmp/worker.pid 2>/dev/null) 2>/dev/null; exit' SIGTERM SIGINT

# Wait for any child process to exit
wait -n

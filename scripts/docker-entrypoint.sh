#!/bin/bash
set -e

pids=()
cleanup() {
  trap - EXIT SIGTERM SIGINT
  kill "${pids[@]}" 2>/dev/null || true
  wait "${pids[@]}" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 0' SIGTERM SIGINT

# Complete additive migrations before SMTP can accept messages.
bun -e 'import { loadConfig, initializeMainDb, closeAllDatabases } from "./packages/core/src/index.ts"; await initializeMainDb(loadConfig()); await closeAllDatabases();'

bun run --cwd /app/packages/web-server src/index.ts &
pids+=($!)
bun run --cwd /app/packages/smtp-server src/index.ts &
pids+=($!)
bun run --cwd /app/packages/worker src/index.ts &
pids+=($!)
PORT=3000 HOSTNAME=0.0.0.0 node /app/packages/frontend/.next/standalone/packages/frontend/server.js &
pids+=($!)

# Stop the container and its siblings if any required service exits.
wait -n

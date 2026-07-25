#!/bin/bash
# Simple development orchestrator — starts all 3 processes
# Usage: bash scripts/dev.sh

echo "Starting Posta in development mode..."

# Ensure data directories exist
mkdir -p data/message-db

# Start each process in the background
bun run --cwd packages/web-server dev &
PID1=$!

bun run --cwd packages/smtp-server dev &
PID2=$!

bun run --cwd packages/worker dev &
PID3=$!

echo "PIDs: web=$PID1 smtp=$PID2 worker=$PID3"
echo "Press Ctrl+C to stop all"

trap 'kill $PID1 $PID2 $PID3 2>/dev/null; exit' SIGTERM SIGINT
wait

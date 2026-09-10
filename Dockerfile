# ---- Stage 1: Base ----
FROM oven/bun:1.3-slim AS base
WORKDIR /app

# Install only what we need for runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ---- Stage 2: Install deps ----
FROM base AS deps
COPY package.json bun.lock turbo.json ./
COPY packages/ packages/
RUN bun install --frozen-lockfile

# ---- Stage 3: Build all packages ----
FROM deps AS builder
COPY . .
RUN bun run typecheck
RUN bun run build

# ---- Stage 4: Runtime ----
FROM base AS runtime
WORKDIR /app

# Copy compiled output only
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/web-server/dist ./packages/web-server/dist
COPY --from=builder /app/packages/smtp-server/dist ./packages/smtp-server/dist
COPY --from=builder /app/packages/smtp-client/dist ./packages/smtp-client/dist
COPY --from=builder /app/packages/worker/dist ./packages/worker/dist
COPY --from=builder /app/packages/message-db/dist ./packages/message-db/dist
COPY --from=builder /app/packages/frontend/.next ./packages/frontend/.next
COPY --from=builder /app/packages/frontend/public ./packages/frontend/public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/*/package.json ./packages/*/
COPY --from=builder /app/packages/frontend/package.json ./packages/frontend/
COPY --from=builder /app/packages/frontend/next.config.js ./packages/frontend/

# Config and scripts
COPY config/ ./config/
COPY scripts/ ./scripts/
RUN chmod +x scripts/*.sh

ENV POSTA_MAIN_DB_URL=postgresql://postgres:postgres@localhost:5432/posta_main \
    POSTA_MESSAGE_DB_URL=postgresql://postgres:postgres@localhost:5432/posta_main \
    POSTA_CONFIG_FILE_PATH=/app/config/posta/posta.yml \
    NODE_ENV=production

EXPOSE 5000 25 9090

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD bun run --cwd /app/packages/web-server dist/index.js /health || exit 1

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]

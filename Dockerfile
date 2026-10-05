# Bun runs backend TypeScript; Node runs Next.js.
FROM node:22-bookworm-slim AS node
FROM oven/bun:1.3-slim AS base
WORKDIR /app
COPY --from=node /usr/local/bin/node /usr/local/bin/node
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json bun.lock turbo.json tsconfig.json ./
COPY packages/ packages/
RUN bun install --frozen-lockfile

FROM deps AS builder
COPY . .
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_API_URL=http://localhost:5001
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN bun run typecheck && bun run build

FROM base AS runtime
# Workspace package entry points use src/*.ts, so keep the source trees.
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY config/ ./config/
COPY scripts/ ./scripts/
RUN chmod +x scripts/*.sh
ENV POSTA_CONFIG_FILE_PATH=/app/config/posta/posta.yml NODE_ENV=production PORT=5001
EXPOSE 5001 3000 25 9090
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD bun -e 'fetch("http://localhost:5001/health").then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))'
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]

# Contributing to Posta

Thanks for helping out. Posta is a self-hosted mail delivery platform: an SMTP server, an HTTP API, a delivery worker and a dashboard, written in TypeScript on Bun and PostgreSQL. Bug reports, fixes and new features are all welcome.

For anything bigger than a small fix, please open an issue first so we can agree on the approach before you write the code.

## What you need

- Bun 1.3 or newer
- PostgreSQL 16. The Compose file in the repo runs one.
- A free [Clerk](https://dashboard.clerk.com) application, for signing in to the dashboard

## Getting set up

```sh
git clone https://github.com/ChxisB/posta.git
cd posta
bun install
docker compose up -d postgres
cp .env.example .env
```

Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in `.env`. The defaults cover everything else for local development, including SMTP on port 2525 so you don't need root.

## Running it

```sh
bun run start            # the API on 5001, SMTP on 2525 and the delivery worker
bun run start:frontend   # the dashboard on http://localhost:3000
```

`bun run start` also creates the database tables. To run one process on its own, use `start:web`, `start:smtp` or `start:worker`.

The first account you create becomes the administrator.

## How the code is laid out

It's a Bun workspace, with Turborepo running tasks across packages.

| Package                 | What it does                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `packages/core`         | Configuration, the main database schema and migrations, DNS checks, logging and shared types  |
| `packages/message-db`   | Each mail server's message store: messages, deliveries, suppressions, webhooks and statistics |
| `packages/smtp-server`  | Receives mail over SMTP                                                                      |
| `packages/smtp-client`  | Delivers outbound mail over SMTP and HTTP endpoints                                          |
| `packages/worker`       | Works the delivery queue, handles bounces and runs scheduled tasks                            |
| `packages/web-server`   | The HTTP API (Elysia): the send API and the dashboard's API                                   |
| `packages/frontend`     | The dashboard and the public site (Next.js)                                                  |
| `packages/bench`        | Delivery latency benchmark                                                                   |

## Tests

The tests run against a real PostgreSQL, the same way CI does. They expect user and password `postgres`, a `posta_test` database, and the server listening on both 5432 and 5433 (the message store tests use 5433). One container published on both ports covers it:

```sh
docker compose stop postgres   # it also wants 5432
docker run -d --name posta-test-db \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=posta_test \
  -p 5432:5432 -p 5433:5432 postgres:16-alpine
```

Then:

```sh
bun run typecheck
bun run test --concurrency=1
```

The frontend's tests use Vitest; the rest use `bun test`. To run a single package, use `bun run --cwd packages/worker test`.

Bun loads a package's own `.env` when you run its tests. If you've created one, its database URL applies to the tests too.

## Style

Format with Prettier using the repo's `.prettierrc`. Don't commit anything that fails `bun run typecheck`.

## Commits and pull requests

- Write commit messages as [Conventional Commits](https://www.conventionalcommits.org): `feat(worker): …`, `fix(web-server): …`, `perf: …`, `docs: …`.
- Keep each pull request to one change, and include tests for any change in behaviour.
- Check that `bun run typecheck` and `bun run test --concurrency=1` pass before you open it. CI runs both on every push and pull request.
- For anything users will notice, add a line to [CHANGELOG.md](CHANGELOG.md) under **Unreleased**.

## Releasing

Versions follow [semantic versioning](https://semver.org), and every package shares the root's version. To release, say, 0.2.0 from a green `main`:

1. Set `"version": "0.2.0"` in the root `package.json` and in each `packages/*/package.json`, then run `bun install` so `bun.lock` picks up the change.
2. In CHANGELOG.md, rename **Unreleased** to `## 0.2.0 – YYYY-MM-DD` and add an empty **Unreleased** above it.
3. Commit, then tag and push:

   ```sh
   git commit -am "chore: release 0.2.0"
   git tag v0.2.0
   git push origin main v0.2.0
   ```

The tag starts the Release workflow. It checks that every `package.json` says 0.2.0, then publishes a GitHub Release whose notes are the 0.2.0 section of the changelog. If a check fails, nothing is published. Commit the fix, move the tag onto it with `git tag -f v0.2.0`, and push again with `git push origin main && git push -f origin v0.2.0`.

## Licence

Posta is released under the [MIT licence](LICENSE). By contributing, you agree that your contributions are released under it too.

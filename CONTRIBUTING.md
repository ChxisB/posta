# Contributing to Posta

Thanks for helping out. Posta is an email platform you can host yourself. It sends through your own AWS SES account and has a Resend-compatible API, a dashboard, an SMTP relay, inbound mail, and SDKs for nine languages. It is written in TypeScript on Node and PostgreSQL. Bug reports, fixes and new features are all welcome.

For anything bigger than a small fix, please open an issue first so we can agree on the approach before you write the code.

## What you need

- Node 24 (`.nvmrc` pins it; Node 22 is the oldest that runs)
- pnpm 11 (`corepack enable` picks up the version in `package.json`)
- PostgreSQL 17 to run the apps. The tests don't need it.
- Docker, if you'd rather run the whole stack with Compose

## Getting set up

```sh
git clone https://github.com/ChxisB/posta.git
cd posta
pnpm install
cp .env.example .env
```

In `.env`, fill `MASTER_ENCRYPTION_KEY` and `BETTER_AUTH_SECRET` (each from `openssl rand -base64 32`). The comments in `.env.example` explain the rest. You can leave AWS unset until you want to send real mail.

## Running it

The quickest way is Compose, which builds the image from your checkout:

```sh
docker compose up --build -d
```

To run the processes on their own instead, start a Postgres. The Compose one doesn't publish a port, so run a separate container:

```sh
docker run -d --name posta-dev-db -p 5432:5432 \
  -e POSTGRES_USER=posta -e POSTGRES_PASSWORD=posta -e POSTGRES_DB=posta \
  postgres:17-alpine
```

Set `DATABASE_URL=postgres://posta:posta@localhost:5432/posta` in `.env`. The processes read their settings from the environment, not from the file, so load it into each terminal with `set -a && . ./.env && set +a`. Then:

```sh
pnpm --filter @posta/db db:migrate
pnpm --filter @posta/api dev      # the API on 3001
pnpm --filter @posta/worker dev   # the job worker
pnpm --filter @posta/web dev      # the dashboard on http://localhost:3000
```

Run each of the last three in its own terminal. `@posta/smtp` (the relay), `@posta/mx` (inbound mail) and `@posta/docs` (the documentation site, on 3002) start the same way when you need them.

## How the code is laid out

It's a pnpm workspace, with Turborepo running tasks across packages.

| Package               | What it does                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `apps/api`            | The HTTP API (Hono, with an OpenAPI spec) and the MCP server                                |
| `apps/web`            | The dashboard (Next.js), the operator console and the hosted unsubscribe pages              |
| `apps/worker`         | Background jobs: sending, broadcasts, SES events, webhooks, inbound mail, scheduled tasks   |
| `apps/smtp`           | The SMTP relay, for apps that send over SMTP instead of the API                             |
| `apps/mx`             | Receives inbound mail on port 25                                                            |
| `apps/docs`           | The documentation site (Fumadocs), in English and Brazilian Portuguese                      |
| `packages/core`       | Shared business logic                                                                       |
| `packages/db`         | The Drizzle schema and migrations                                                           |
| `packages/config`     | Environment parsing and shared settings                                                     |
| `packages/queue`      | The job queue, on pg-boss                                                                   |
| `packages/ses`        | The SES client, and the AWS steps of the setup wizard                                       |
| `packages/billing`    | Stripe billing, for hosted deployments                                                      |
| `packages/i18n`       | Locale handling shared by the apps                                                          |
| `packages/setup`      | The setup wizard, published as `@tack-labs/posta-setup`                                     |
| `packages/cli`        | The migration CLI, published as `@tack-labs/posta-cli`                                      |
| `packages/sdk`        | The SDKs (Node, Python, Ruby, PHP, Go, Java, .NET, Elixir, Rust), each a project of its own |
| `packages/test-utils` | Test helpers, including an in-process Postgres                                              |

The API mirrors Resend's, so code written for Resend works against Posta. Keep its route names, methods and response fields as they are; add Posta's own fields beside them.

## Tests

The tests use Vitest and run against PGlite, a Postgres that runs in the test process, so you don't need a database server:

```sh
pnpm typecheck
pnpm test
```

To run one package, use `pnpm --filter @posta/core test`. The web and API suites are the largest; if they time out on a busy laptop, run them on their own. The CLI's suite takes several minutes.

The SDKs aren't part of the workspace. Each one has its own toolchain, and its tests run from its directory: `pnpm test` in `packages/sdk/node`, `pytest` in `packages/sdk/python`, `go test ./...` in `packages/sdk/go`, and so on.

`scripts/e2e/receiving/run.mts` is an end-to-end test of inbound mail. It needs Docker and openssl, and CI doesn't run it.

## Style

Format and lint with Biome: `pnpm lint` checks, and `pnpm lint:fix` fixes what it can. Don't commit anything that fails `pnpm lint` or `pnpm typecheck`.

If you change the database schema in `packages/db`, run `pnpm db:generate` and commit the migration it writes to `packages/db/drizzle`. CI fails when the schema and the migrations disagree.

Dashboard copy lives in `apps/web/messages/en` and `apps/web/messages/pt-BR`. Add every new key to both; a test checks that they match. The docs pages come in pairs too: `page.mdx` and `page.pt-BR.mdx`.

## Commits and pull requests

- Write commit messages as [Conventional Commits](https://www.conventionalcommits.org): `feat(worker): …`, `fix(api): …`, `perf: …`, `docs: …`.
- Keep each pull request to one change, and include tests for any change in behaviour.
- Check that `pnpm lint`, `pnpm typecheck` and `pnpm test` pass before you open it. CI runs them on every pull request and every push to `main`, along with the migration check, a secret scan and a Docker build.
- For anything users will notice, add a line to [CHANGELOG.md](CHANGELOG.md) under **Unreleased**.

## Releasing

Versions follow [semantic versioning](https://semver.org).

- **The server.** Every push to `main` that passes CI publishes `ghcr.io/chxisb/posta:edge`. To release, say, 1.2.0, rename **Unreleased** in CHANGELOG.md to `## 1.2.0 – YYYY-MM-DD`, add an empty **Unreleased** above it, commit, and push the tag `v1.2.0`. CI then publishes `:1.2.0`, `:1.2` and `:latest`, along with the matching `posta-backup` image.
- **The CLI.** Bump `version` in `packages/cli/package.json`, then push a tag `cli-v<version>`. The release-cli workflow publishes it to npm through Trusted Publishing.
- **The setup wizard.** Bump `version` in `packages/setup/package.json`, then run the release-setup workflow from the Actions tab.

## Licence

Posta's code is released under the [AGPL-3.0](LICENSE). The SDKs in `packages/sdk` and the CLI in `packages/cli` are MIT, and each has its own `LICENSE` file. By contributing, you agree that your contributions are released under the licence of the part you change.

The Posta name, wordmark and logos are not covered by either licence.

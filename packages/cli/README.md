# @tack-labs/posta-cli

Moves an email account to [Posta](https://github.com/ChxisB/posta):
contacts, segments, topics, properties, templates, webhooks, domains and
suppressions. Reads from the source provider, writes to your Posta
instance (Cloud or self-hosted), and is safe to run again — a second run right
before cutover syncs what changed since the first.

```sh
npx @tack-labs/posta-cli migrate --from resend                    # interactive: connect, choose, plan, confirm, apply, summary
npx @tack-labs/posta-cli migrate plan --from resend --out plan.json   # read-only; exit 0 nothing to do, 2 changes, 1 error
npx @tack-labs/posta-cli migrate apply plan.json --yes
npx @tack-labs/posta-cli migrate status
npx @tack-labs/posta-cli migrate rollback                         # deletes only what the tool created
```

Node 18 or newer; no dependencies.

## What moves

| Resource | How |
| --- | --- |
| Contacts | Upserted by email through the batch endpoint; `unsubscribed` and topic opt-outs are preserved, never re-subscribed. Topic subscriptions and properties follow in two per-contact passes that run after everything else, so the account is sendable before they finish. |
| Segments, topics, properties | Matched by name / name / key: created when missing, updated when different, left alone when equal. Segment memberships follow the contacts. |
| Templates | Name, alias, subject, html, text. From, reply-to and variables cannot be stored — listed as manual steps. |
| Webhooks | Endpoint and events. Signing secrets are copied so receivers keep verifying (`--fresh-webhook-secrets` mints new ones, shown once). Events Posta also emits carry over (`email.*`, `contact.created`, `contact.updated`, `contact.deleted`); the rest are dropped per webhook and listed. |
| Suppressions | Bounces, complaints and manual entries, with their origin. |
| Domains | Created with return path and tracking settings, in the one SES region your Posta instance serves — the Resend region does not carry over. DNS records must be added again (DKIM keys are per provider); the report prints a copy-ready table. Both providers can stay verified side by side. |
| Broadcasts | Drafts and scheduled ones import as drafts; sent ones are skipped unless `--include-sent`. |
| API keys | Not recreated (the source only exposes names); the report lists them as a to-do. |

Audiences (deprecated in Resend) are skipped — segments cover them.

## Environment

| Variable | Meaning |
| --- | --- |
| `RESEND_API_KEY` | Source key (full access; the tool only ever reads). Alternatives: `--from-key-stdin`, or a masked prompt in a terminal. |
| `POSTA_API_KEY` | Posta key (full access). Alternatives: `--to-key-stdin`, or a masked prompt. |
| `POSTA_BASE_URL` | API URL of a self-hosted Posta instance. Same as `--to-url`. Unset, the target is Posta Cloud (`https://api.posta.example`), like the SDKs; a terminal asks. |
| `NO_COLOR` | Disables ANSI colors. |
| `DO_NOT_TRACK` | Honored as a no-op: the tool sends no telemetry, never phones home and never checks for updates. |

## Flags

`posta --help` lists every flag. The ones that change what happens:

- `--only a,b` / `--skip a,b` — resource names: `domains, properties, topics, segments, contacts, enrichment, broadcasts, templates, webhooks, suppressions, api-keys`. `enrichment` is the per-contact pass (topic subscriptions, then properties) that runs last.
- `--rps N` — requests per second against the source (default 8). Resend's team limit is 10, shared with your production sending; the CLI prints the limit it detects and warns above it. Go past 10 (up to 100) only after Resend raised your limit.
- `--on-conflict upsert|skip|error` — contacts that already exist on the target (default `upsert`).
- `--include-sent`, `--fresh-webhook-secrets`, `--fresh` (ignore the state file).
- `--yes`, `--non-interactive` (automatic when stdin is not a terminal), `--json` (JSON on stdout, progress on stderr), `--verbose`, `--color auto|always|never` (`--no-color` = `never`).

Exit codes: 0 ok · 1 error · 2 plan has changes (`plan` only) · 3 partial, some items failed (details in the report).

## Files

`.posta/migrate-state.json` (every id created, resume cursors, the plan
hash) and `.posta/migrate-report.{json,md}` are written next to where
you run the tool, mode 0600. `.posta/` is appended to `.gitignore` when
one exists there. No file ever contains a key.

## Security

Your Resend key never leaves your machine — the tool only ever contacts
`api.resend.com` and your Posta API. Against Resend it sends GET requests
only, to documented endpoints. Keys live in memory for the duration of the
run: they are never written to a file and are redacted from every log line.
There is no telemetry, no update check, no third party.

## Re-running and rolling back

Every run is a diff: existing rows are updated when they differ and left
alone when they match. Run `posta migrate --from resend` again right
before cutover to sync the contacts that arrived in between.

`posta migrate rollback` deletes only the ids the tool created (never
rows it merely updated), in reverse dependency order, after showing the list
and asking for confirmation.

---

Resend is a trademark of Plus Five Five, Inc. Posta is not affiliated with or endorsed by Resend.

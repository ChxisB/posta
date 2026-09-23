# Changelog

Notable changes to Posta, newest first.

## Unreleased

## 0.1.0 – 2026-09-23

This is Posta's first release: a self-hosted platform for sending and receiving email from your own apps, written in TypeScript on Bun and PostgreSQL. It runs from source, as the README describes. There's no container image yet; see Known issues.

### Sending

- An SMTP server and an HTTP send API (`POST /api/v1/send/message`) that accepts JSON or a raw message. Every mail server has its own credentials.
- IP pools, with rules that pick a pool by sender or recipient.
- Per-server send limits, so one noisy app can't damage the sending reputation of the others.
- Outbound SMTP pipelines each conversation with the receiving server. A temporary rejection (4xx) is retried later; a permanent one (5xx) fails the message.

### Receiving

- Inbound routing: mail for your domains is handed to an HTTP endpoint or forwarded over SMTP, according to routes you set for each address.
- Spam scoring with Rspamd or SpamAssassin, and attachment scanning with ClamAV.

### Deliverability

- For each domain, Posta generates the SPF, DKIM and MX records and checks the DNS until they resolve. Outgoing mail is DKIM-signed.
- When a receiving server rejects an address permanently, Posta adds it to the mail server's suppression list, and later messages to it are held instead of sent. The list can be viewed, added to and cleared through the API; there's no dashboard page for it yet.
- Optional open and click tracking for each domain, served from a tracking domain of your own.

### Visibility

- Full delivery history: every attempt, the remote server's response and the bounce reason.
- Release held messages and retry failed deliveries from the dashboard or the API.
- Signed webhooks for `MessageSent`, `MessageDelayed`, `MessageDeliveryFailed` and `MessageHeld`, retried with backoff.

### Running it

- A dashboard for organisations, mail servers, users and IP pools. A setup wizard walks through creating an organisation, a mail server, a domain and its DNS records, and credentials.
- The first account to sign up becomes the administrator. Nobody else can sign in until an administrator adds their email under Administration → Users. Sign-in uses Clerk, and no webhook is needed.
- A setup screen at `/` on a fresh installation. It checks that the API, the database and the Clerk keys are ready before the admin account is created, and forwards to sign-in after that.
- The worker picks up a message as soon as it's queued, using PostgreSQL `LISTEN`/`NOTIFY`.
- Received HTML messages are shown in a sandboxed frame.
- `.env.example` puts SMTP on port 2525, which doesn't need root. Use 25 in production.
- `packages/bench`: a delivery benchmark with open-loop load generation and latency measured at each stage.

### Known issues

These are known and not yet fixed.

Sending and receiving:

- Bounces that arrive after the receiving server has accepted a message go to the sender's own address, not to Posta. The envelope sender is the message's From address rather than a Posta return path, so these bounces don't update the message or the suppression list. Only rejections during the SMTP conversation do.
- On the send API, a sender or recipient written with a display name, such as `"Ada" <ada@example.com>`, is passed to the receiving server with the name still attached, and DKIM signing and tracking are skipped for that message. Use bare addresses for now.
- Outbound SMTP connections aren't closed after a delivery, and aren't reused for the next one.
- Message timestamps are stored to within about a minute (±64 seconds).
- Mail servers are created without a permalink, so SMTP `AUTH CRAM-MD5`, whose username is `organisation/server`, never matches. Use `AUTH PLAIN` or `AUTH LOGIN`.

Running it:

- On a fresh database, start the API first and the SMTP server and worker once it's up. Started together, they race to create the tables and one of them exits with `relation "credentials" already exists`. Starting it again fixes it.
- The worker logs a `relation "messages" does not exist` error from its partition maintenance task. It's harmless: messages are stored in tables that don't use partitions yet.
- There's no container image. The `Dockerfile` and the `posta` service in `docker-compose.yml` are out of date and don't build. `docker compose up -d postgres` still works for the database.

Dashboard:

- The organisation page shows the organisation's permalink in place of its name, because the request for its details fails.
- Organisation statistics fail to load.
- The HTML and plain-text tabs on a message show the raw multipart body, boundaries included.
- Errors from the API are shown only as "API error", without the reason.
- The domain DNS setup page shows the DKIM record without its key.

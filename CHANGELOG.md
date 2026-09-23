# Changelog

Notable changes to Posta, newest first.

## Unreleased

This is Posta's first release: a self-hosted platform for sending and receiving email from your own apps, written in TypeScript on Bun and PostgreSQL.

### Sending

- An SMTP server and an HTTP send API (`POST /api/v1/send/message`) that accepts JSON or a raw message. Every mail server has its own credentials.
- IP pools, with rules that pick a pool by sender or recipient.
- Per-server send limits, so one noisy app can't damage the sending reputation of the others.
- Outbound SMTP pipelines each conversation with the receiving server and reuses pooled connections.

### Receiving

- Inbound routing: mail for your domains is handed to an HTTP endpoint or forwarded over SMTP, according to routes you set for each address.
- Spam scoring with Rspamd or SpamAssassin, and attachment scanning with ClamAV.

### Deliverability

- For each domain, Posta generates the SPF, DKIM and MX records and checks the DNS until they resolve. Outgoing mail is DKIM-signed.
- A hard bounce adds the address to a suppression list, and later sends to it stop before they leave.
- Optional open and click tracking for each domain, served from a tracking domain of your own.

### Visibility

- Full delivery history: every attempt, the remote server's response and the bounce reason.
- Release held messages and retry failed deliveries from the dashboard or the API.
- Signed webhooks for `MessageSent`, `MessageDelayed`, `MessageDeliveryFailed` and `MessageHeld`, retried with backoff.

### Running it

- A dashboard for organisations, mail servers, users and IP pools. A setup wizard walks through creating an organisation, a mail server, a domain and its DNS records, and credentials.
- The first account to sign up becomes the administrator. Nobody else can sign in until an administrator adds their email under Administration → Users. Sign-in uses Clerk, and no webhook is needed.
- A public site at `/` covering what Posta does and how to set it up.
- Each mail server's messages are stored in monthly PostgreSQL partitions. The worker creates them two months ahead, so the store never has nowhere to put a message.
- The worker picks up a message as soon as it's queued, using PostgreSQL `LISTEN`/`NOTIFY`.
- Received HTML messages are shown in a sandboxed frame.
- `.env.example` puts SMTP on port 2525, which doesn't need root. Use 25 in production.
- `packages/bench`: a delivery benchmark with open-loop load generation and latency measured at each stage.

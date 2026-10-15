# Changelog

Notable changes to Posta, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [semantic versioning](https://semver.org).

The SDKs in `packages/sdk` and the CLI in `packages/cli` are versioned on their own and keep their own changelogs.

## Unreleased

The first release of Posta as an email platform you host on your own AWS SES. It replaces the earlier Posta mail server, released as 0.1.0 on 2026-09-23, whose code and changelog are in the git history.

### Added

- A Resend-compatible API: send, batch, get and cancel emails, with the same request and response shapes as Resend. `Idempotency-Key` dedupes retried sends.
- API keys with the `po_` prefix, created and revoked from the dashboard.
- Domains with guided DNS verification, and DKIM managed by SES or brought by you.
- Contacts with segments, topics, CSV import and bulk endpoints, and broadcasts sent to all contacts, a segment or a topic.
- Templates with merge fields, one-click unsubscribe (RFC 8058) with a hosted page, and a suppression list fed by hard bounces and complaints.
- Template versions and tags. A template is a draft until `POST /templates/{id}/publish` freezes it as the next numbered version, and tags such as `production` point at a version and can move. `POST /emails`, `POST /emails/batch` and `POST /broadcasts` take `template: { id, version?, tag?, variables? }` in place of `html` and `text`, and `subject` is optional with a template. New routes list, read and delete versions and set and delete tags, and the MCP server, the Node SDK and the CLI follow. The dashboard editor has a Publish button, a chip showing where the template stands, and a Versions dialog to manage tags, delete versions and load an old version into the editor.
- Signed webhooks in the Standard Webhooks format, with a delivery log.
- An SMTP relay on port 2587 that authenticates with an API key.
- Receiving (beta): mail to any address on a verified domain, through an MX the instance runs, with Resend's `emails.receiving` API and the `email.received` webhook.
- A dashboard in English and Brazilian Portuguese, and an MCP server for AI agents.
- A Docker image, `ghcr.io/chxisb/posta`, and a setup wizard, `npx @tack-labs/posta-setup`, that writes the `.env`, creates the AWS resources and starts the stack.
- A CLI, `@tack-labs/posta-cli`, that migrates contacts, segments, topics, templates, webhooks, domains and suppressions from Resend.
- SDKs for Node, Python, Ruby, PHP, Go, Java, .NET, Elixir and Rust.

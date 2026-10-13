# Changelog

Versions follow the MillionSend API they target; the API stays wire-compatible with Resend.

## 0.8.0 — 2026-09-08

- `contacts.remove(address, { erase: true })` and `contacts.batch.remove({ ids | emails, erase: true })` also scrub the address from email history, event payloads and API logs (`?erase=true` on the single delete, body `erase` on the batch) — a GDPR/LGPD erasure. Without `erase` a delete keeps the contact's emails in the send log, as before. Responses are unchanged. Needs MillionSend v0.6.54.

## 0.7.0 — 2026-09-05

- `contacts.list({ include: ["properties", "topics"] })` attaches the property map and the topic subscriptions to every item (`?include=`), on the team list and on `segmentId` lists alike. Without `include` the item is unchanged.
- `contacts.batch.get(addresses, { include })` reads up to 1000 contacts by id or email in one request via `POST /contacts/batch/get`; entries that match no contact are returned under `missing`.
- `ContactListItem` gains optional `properties` and `topics`; `batch.get` returns `BatchGetContact` (the list item plus `object: "contact"`). Existing types are unchanged. Needs MillionSend v0.6.36 or later.

## 0.6.0 — 2026-09-04

- `contacts.batch.remove(...)` posts ids or emails to `POST /contacts/batch/remove` (bulk delete).
- `contacts.preferencesLink(idOrEmail)` mints the contact's hosted preference page URL via `POST /contacts/{id}/preferences-link`.
- `webhooks.rotate(id, { overlap? })` swaps the signing secret with an optional overlap window during which both secrets verify; the webhook detail carries `previous_secret_expires_at`.
- Contact topic rows carry `visibility`.
- The `WebhookEvent` union names the `contact.*` and `suppression.*` events and `quota.paused`.
- `PATCH /contacts/{id}` `properties` are documented as merged with `null` removing a key; the API enforces that from v0.6.35.

## 0.5.0 and earlier

See the git history; no changelog was kept before 0.6.0.

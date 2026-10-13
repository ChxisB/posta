# millionsend

Official Node.js / TypeScript SDK for [MillionSend](https://github.com/MillionSend/millionsend) — a self-hostable, Resend-compatible email API on AWS SES.

The API is wire-compatible with Resend, and this SDK deliberately mirrors the
shape of `resend`, so migrating is mostly a find-and-replace: swap the import
and the class name. MillionSend Cloud works with just the key; a self-hosted
instance sets its origin via `baseUrl`.

## Install

```bash
npm install millionsend
# or: pnpm add millionsend / yarn add millionsend / bun add millionsend
```

Requires Node.js 18+ (uses the global `fetch`).

## Quickstart

```ts
import { MillionSend } from "millionsend";

const ms = new MillionSend("ms_123"); // Cloud; self-hosted: { baseUrl: "https://mail.acme.dev" }

const { data, error } = await ms.emails.send({
  from: "Acme <onboarding@acme.dev>",
  to: "success@simulator.amazonses.com",
  subject: "Hello from MillionSend",
  html: "<strong>It works!</strong>",
});

if (error) {
  console.error(error.name, error.message);
} else {
  console.log("sent", data.id);
}
```

## Configuration

```ts
new MillionSend(apiKey?, {
  baseUrl?, // defaults to MILLIONSEND_BASE_URL, then MillionSend Cloud (https://api.millionsend.com)
  fetch?,   // custom fetch implementation (proxies, tests, custom agents)
  userAgent?, // extra User-Agent suffix
  timeoutMs?, // request deadline; defaults to 30,000 ms
  allowInsecureHttp?, // accept a non-loopback http:// baseUrl (default: refused)
});
```

- `apiKey` falls back to `process.env.MILLIONSEND_API_KEY`. Missing key → throws at construction.
- `baseUrl` falls back to `process.env.MILLIONSEND_BASE_URL`, then to MillionSend Cloud (`https://api.millionsend.com`). **Self-hosting? Set it to your instance's origin.**
- Plain `http://` is only accepted for loopback hosts (`localhost`, `127.0.0.1`, `::1`); any other `http://` URL throws at construction, since the API key is sent as a bearer header. Pass `allowInsecureHttp: true` to talk to a non-TLS instance elsewhere (e.g. inside a private network).

## Errors

No method throws for an API error — every call resolves to `{ data, error }`.
`error` is `null` on success; otherwise `{ name, message, statusCode }` where
`name` is a stable snake_case code you can switch on (`validation_error`,
`not_found`, `restricted_api_key`, `sending_paused`,
`all_recipients_suppressed`, …). Client-side and transport failures carry
`statusCode: null`.

`emails.send` and `batch.send` answer `422 all_recipients_suppressed` when every
`to` recipient is on the suppression list or opted out of the send's `topicId`.

```ts
const { data, error } = await ms.emails.get(id);
if (error?.name === "not_found") { /* … */ }
```

## Resources

Inputs are camelCase and mapped to the wire's snake_case (`replyTo` → `reply_to`,
`scheduledAt` → `scheduled_at`, `topicId` → `topic_id`, …). Every field you pass
is sent; nothing is dropped client-side. Responses are the wire shape verbatim.
List endpoints take `{ limit, after, before }` (keyset cursors) and return
`{ object: "list", data, has_more }`.

### Emails

```ts
await ms.emails.send({
  from: "Acme <onboarding@acme.dev>",
  to: ["ada@acme.dev"], cc, bcc, replyTo,
  subject: "Hello",
  html: "<p>Hi</p>", text: "Hi",
  scheduledAt: "2026-09-01T09:00:00Z",       // or "in 2 hours"
  tags: [{ name: "campaign", value: "launch" }],
  topicId,                                   // skip opted-out recipients, add unsubscribe link
  attachments: [{ filename: "hi.txt", content: Buffer.from("hi"), contentType: "text/plain" }],
  headers: { "X-Entity-Ref-ID": "123" },
}, { idempotencyKey });                      // POST /emails
await ms.emails.get(id);                     // GET /emails/:id (includes a nullable `score`)
await ms.emails.list({ limit: 50 });         // GET /emails
await ms.emails.update({ id, scheduledAt }); // PATCH /emails/:id (reschedule)
await ms.emails.cancel(id);                  // POST /emails/:id/cancel (scheduled only)
await ms.emails.remove(id);                  // DELETE /emails/:id
await ms.emails.getInsights(id);             // GET /emails/:id/insights (best-practice report)
```

`attachments[].content` is a base64 string or a `Buffer` (encoded for you).
`template` is sent through as-is; MillionSend answers `422` until templates can be sent.

### Batch

```ts
const { data } = await ms.batch.send([payloadA, payloadB], {
  idempotencyKey,
  batchValidation: "permissive", // x-batch-validation; default "strict" rejects the whole batch
});
data.data;   // [{ id }] for the accepted emails
data.errors; // permissive only: [{ index, message }] for the rejected ones
```

### Contacts

Contacts are team-global — one list per team, no audiences.

```ts
await ms.contacts.create({
  email: "ada@acme.dev", firstName: "Ada", lastName: "Lovelace",
  unsubscribed: false, properties: { plan: "pro" },
  segments: [{ id: segmentId }],
  topics: [{ id: topicId, subscription: "opt_in" }],
});
await ms.contacts.get({ email });                  // by id or email (email wins)
await ms.contacts.get(contactId);                  // bare string works too
await ms.contacts.update({ id, unsubscribed: true, firstName: null }); // null clears
await ms.contacts.remove({ email });               // the contact's emails stay in the send log
await ms.contacts.remove({ email }, { erase: true }); // ?erase=true also scrubs the address from
                                                      // email history, events and API logs (GDPR/LGPD)
await ms.contacts.list({ limit: 50 });
await ms.contacts.list({ segmentId });             // GET /segments/:id/contacts
// Bulk read (MillionSend extension): attach properties and topic subscriptions to every item,
// so an audience reads in one request per 100 contacts instead of one per contact
await ms.contacts.list({ limit: 100, include: ["properties", "topics"] });

// Hosted preference page (MillionSend extension): the same page the unsubscribe links open.
// The URL is a non-expiring, contact-scoped capability — show it only to the contact.
const { data } = await ms.contacts.preferencesLink({ email }); // POST /contacts/:id/preferences-link
data.url; // 422 when the instance cannot mint links (APP_BASE_URL unset)

// Bulk create (MillionSend extension): up to 1000 per call
const { data } = await ms.contacts.batch.create(items, {
  onConflict: "upsert",          // ?on_conflict=error|skip|upsert
  batchValidation: "permissive", // x-batch-validation
});
data.data;   // [{ index, id, status: "created" | "updated" | "skipped" }]
data.counts; // { created, updated, skipped, failed }
data.errors; // permissive only

// Bulk lookup (MillionSend extension): up to 1000 contacts by id or email in one request,
// in request order; unknown entries are listed, not errors — one request against the rate limit
const { data } = await ms.contacts.batch.get([contactId, { email }], { include: ["topics"] });
data.data;    // [{ object: "contact", id, email, ..., topics }] — the contacts found
data.missing; // [{ index, email }] — request entries that matched nobody

// Bulk delete (MillionSend extension): up to 1000 per call, by ids or by emails.
// Their emails stay in the send log; erase: true also scrubs each address from email history
const { data } = await ms.contacts.batch.remove({ emails, erase: true }); // or { ids }
data.data; // [{ object: "contact", contact, deleted: true }] — only the rows actually deleted

// Segment membership
await ms.contacts.segments.add({ email, segmentId });
await ms.contacts.segments.remove({ id: contactId, segmentId });

// Topic subscriptions (granular unsubscribe)
await ms.contacts.topics.update({ email, topics: [{ id: topicId, subscription: "opt_out" }] });
const { data } = await ms.contacts.topics.list({ email }); // GET /contacts/:id/topics, unpaginated
data.data; // [{ id, name, description, subscription: "opt_in" | "opt_out", explicit, visibility }]
           // `subscription` is the effective choice; `explicit: false` means it is the topic default
```

`contact.properties` on `get` is typed per property: `{ plan: { type: "string", value: "pro" } }`.

### Contact properties

```ts
await ms.contactProperties.create({ key: "plan", type: "string", fallbackValue: "free" });
await ms.contactProperties.list();
await ms.contactProperties.get(id);
await ms.contactProperties.update({ id, fallbackValue: null }); // null clears
await ms.contactProperties.remove(id);
```

### Topics

```ts
await ms.topics.create({ name: "Product updates", defaultSubscription: "opt_in", visibility: "public" });
await ms.topics.get(id);
await ms.topics.list();     // { object: "list", data, has_more: false } — topics are unpaginated
await ms.topics.update(id, { name: "Product news" });
await ms.topics.remove(id);
```

### Broadcasts

Target a `segmentId` and/or `topicId`; omit both to send to all contacts.

```ts
const { data } = await ms.broadcasts.create({
  name: "Launch", segmentId, from: "Acme <news@acme.dev>", subject: "Launch",
  html: "<p>Hi {{{FIRST_NAME|there}}}</p>", previewText: "It's here",
  send: true, scheduledAt: "in 1 hour",   // omit `send` to save a draft
});
await ms.broadcasts.list();
await ms.broadcasts.get(id);
await ms.broadcasts.update(id, { subject: "Launch 🚀", topicId: null });  // draft only; null clears
await ms.broadcasts.send(id, { scheduledAt: "2026-09-01T09:00:00Z" }); // omit to send now
await ms.broadcasts.cancel(id);   // scheduled only
await ms.broadcasts.remove(id);   // draft only
```

### Suppressions

```ts
await ms.suppressions.add({ email: "bounced@acme.dev", origin: "manual" }); // `create` is an alias
await ms.suppressions.list({ origin: "bounce", limit: 100 });
await ms.suppressions.get(idOrEmail);
await ms.suppressions.remove(idOrEmail);
await ms.suppressions.batch.add({ emails, origin: "unsubscribe" });   // up to 1000
await ms.suppressions.batch.remove({ emails });                       // or { ids }
```

### Domains

```ts
const { data } = await ms.domains.create({
  name: "acme.dev", region: "us-east-1", customReturnPath: "send",
  openTracking: true, clickTracking: true, trackingSubdomain: "links",
});
data.records; // DNS records to publish
await ms.domains.list();
await ms.domains.get(id);
await ms.domains.verify(id);
await ms.domains.update({ id, clickTracking: false, trackingSubdomain: null }); // null clears
await ms.domains.remove(id);
```

### Webhooks

```ts
const { data } = await ms.webhooks.create({
  endpoint: "https://acme.dev/hooks/millionsend",
  events: ["email.delivered", "email.bounced"],
  signingSecret: "whsec_…", // optional: keep an existing secret
});
data.signing_secret;
await ms.webhooks.list();
await ms.webhooks.get(id);   // includes signing_secret and previous_secret_expires_at
await ms.webhooks.update(id, { status: "disabled" });
await ms.webhooks.remove(id);

// Rotate the signing secret (MillionSend extension). During `overlapHours` (0–72, default 24)
// every delivery carries both signatures, so the receiver can switch without a gap.
const { data } = await ms.webhooks.rotate(id, { overlapHours: 24 }); // or { signingSecret: "whsec_…" }
data.signing_secret; data.previous_secret_expires_at; // null when the old secret is dropped at once
```

Subscribable events include `email.*`, `deliverability.*`, `quota.*`, `contact.*`
(`created`, `updated`, `deleted`, `unsubscribed`, `resubscribed`, `topic_opt_in`,
`topic_opt_out`) and `suppression.added` / `suppression.removed`.

### API keys

```ts
const { data } = await ms.apiKeys.create({ name: "ci", permission: "sending_access", domainId });
data.token; // shown once
await ms.apiKeys.list();
await ms.apiKeys.remove(id);
```

### Templates

`id` arguments accept the template id or its alias.

```ts
await ms.templates.create({ name: "Welcome", html: "<p>Hi</p>", subject: "Welcome!", alias: "welcome" });
await ms.templates.list();
await ms.templates.get("welcome");
await ms.templates.update("welcome", { subject: null, alias: null }); // null clears
await ms.templates.duplicate(id);
await ms.templates.publish(id);   // no-op: every save is live (kept for Resend compatibility)
await ms.templates.remove(id);
```

### Segments (MillionSend extension)

Dynamic segments are a saved filter over the team's contacts — a MillionSend
superset with no Resend equivalent.

```ts
await ms.segments.create({
  name: "Pro plan",
  filter: { match: "all", conditions: [{ field: "property:plan", op: "equals", value: "pro" }] },
});
await ms.segments.get(id);   // includes a live contact_count
await ms.segments.list();
await ms.segments.update(id, { name: "Pro tier" });
await ms.segments.remove(id);
```

### Deliverability (MillionSend extension)

The account-level deliverability score over the trailing 30 days. Scores are
0–10 (`null` until there is enough data); per-email reports live on
`ms.emails.getInsights(id)`.

```ts
const { data } = await ms.deliverability.get();
// data.score, data.band, data.complaint_rate, data.guardrail_status, …
```

### Usage (MillionSend extension)

```ts
const { data } = await ms.usage.get();
// data.plan, data.limits.emails_per_day, data.today.emails_sent, data.today.resets_at
```

## Migrating from Resend

```diff
- import { Resend } from "resend";
- const resend = new Resend("re_123");
+ import { MillionSend } from "millionsend";
+ const ms = new MillionSend("ms_123"); // self-hosted: add { baseUrl: "https://mail.acme.dev" }
```

Method names, payloads and request options (`idempotencyKey`, `batchValidation`)
match `resend`. Notes:

- **No audiences.** Contacts are team-global, so `.audiences` calls have no
  equivalent — drop them and call `.contacts` directly. The API keeps
  `/audiences/*` routes as a compatibility shim, but the SDK does not expose them.
  For subsets of contacts, use `.segments` (dynamic filters) or topics.
- **Templates** cannot be sent yet: `emails.send({ template })` is forwarded and
  answered with `422`. `templates.publish` is a no-op (every save is live).
- **MillionSend extensions** (no Resend counterpart): `segments`,
  `deliverability`, `usage`, `emails.getInsights`, `contacts.batch`,
  `contacts.preferencesLink`, `webhooks.rotate`, and the `origin` field on
  suppressions.

## License

MIT

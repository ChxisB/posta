# posta

Official Ruby SDK for [Posta](https://github.com/ChxisB/posta): a
self-hostable, Resend-compatible email API on AWS SES.

The API is wire-compatible with Resend, and this gem deliberately mirrors the shape of
[`resend`](https://github.com/resend/resend-ruby), so migrating is mostly a find-and-replace:
swap the constant (and, on a self-hosted instance, set `base_url`).

## Install

```bash
gem install posta
```

Or in a `Gemfile`:

```ruby
gem "posta"
```

Requires Ruby 3.0+. Only the standard library is used at runtime (`net/http`, `json`).

## Quickstart

```ruby
require "posta"

Posta.api_key = "po_123"
# Posta.base_url = "https://mail.acme.dev" # self-hosted only; defaults to Posta Cloud

email = Posta::Emails.send(
  from: "Acme <onboarding@acme.dev>",
  to: "success@simulator.amazonses.com",
  subject: "Hello from Posta",
  html: "<strong>It works!</strong>"
)

puts email[:id]
```

Every call returns a symbol-keyed `Hash` on success and raises a `Posta::Error`
on any non-2xx response (see [Error handling](#error-handling)).

## Configuration

```ruby
Posta.api_key  = "po_123"                # falls back to ENV["POSTA_API_KEY"]
Posta.base_url = "https://mail.acme.dev" # falls back to ENV["POSTA_BASE_URL"],
                                         # then https://api.posta.example (Cloud)
Posta.allow_insecure_http = false        # accept a non-loopback http:// base_url
```

Posta Cloud works with just the API key; a self-hosted instance sets `base_url` to
its origin. An explicitly assigned value always wins over the environment.
Plain `http://` is only accepted for loopback hosts (`localhost`, `127.0.0.1`, `::1`); any
other `http://` URL raises `Posta::ApplicationError` on the first call, since the API
key is sent as a bearer header. Set `allow_insecure_http = true` to talk to a non-TLS
instance elsewhere (e.g. inside a private network).

Params are symbol-keyed hashes and go on the wire **exactly as given**: nothing is
filtered or renamed (Ruby's snake_case is already the wire's snake_case: `reply_to`,
`scheduled_at`, `segment_id`). A `nil` value is sent as JSON `null`, which is how the API
clears a nullable field (`topic_id`, `first_name`, a template `alias`, …); omit the key to
leave it unchanged.

## Request options

`Emails.send`, `Batch.send` and `Contacts::Batch.create` take a trailing options hash, in
either of two shapes:

```ruby
Posta::Emails.send(payload, idempotency_key: "order-42")               # flat
Posta::Emails.send(payload, options: { idempotency_key: "order-42" })  # resend-ruby keyword shape
```

| option             | header / query        | where                                   |
| ------------------ | --------------------- | --------------------------------------- |
| `idempotency_key`  | `Idempotency-Key`     | any POST                                |
| `batch_validation` | `x-batch-validation`  | `Batch.send`, `Contacts::Batch.create`  |
| `on_conflict`      | `?on_conflict=`       | `Contacts::Batch.create`                |

`batch_validation` is `"strict"` by default (one invalid item rejects the whole batch) or
`"permissive"` (the valid subset is processed and the failures come back under `errors:`
as `[{ index:, message: }]`).

## Resources

### Emails

```ruby
Posta::Emails.send(payload, idempotency_key: "order-42") # POST  /emails
Posta::Emails.get(id)                                    # GET   /emails/:id (includes score: 0-10 or nil)
Posta::Emails.list(limit: 20, after: id)                 # GET   /emails
Posta::Emails.update(id, scheduled_at: "in 2 hours")     # PATCH /emails/:id (scheduled only)
Posta::Emails.cancel(id)                                 # POST  /emails/:id/cancel (scheduled only)
Posta::Emails.remove(id)                                 # DELETE /emails/:id
Posta::Emails.get_insights(id)                           # GET   /emails/:id/insights (404 until computed)

Posta::Batch.send([payload_a, payload_b], idempotency_key: "run-7", batch_validation: "permissive") # up to 100
```

The send payload accepts `from`, `to`, `subject`, `html`, `text`, `cc`, `bcc`, `reply_to`,
`scheduled_at`, `tags: [{ name:, value: }]`, `topic_id`, `headers: { "X-..." => "..." }`,
`attachments: [{ filename:, content: <base64>, content_type:, content_id:, path: }]` and
`template` (`{ id:, version: or tag:, variables: }`, a published template version instead of
`html`/`text`; `subject` is optional with it). `to`, `cc`, `bcc` and
`reply_to` accept either a string or an array. `Emails.create` is an alias of `Emails.send`
(as is `Batch.create`), mirroring Resend. `Emails.update` also takes resend-ruby's single
hash: `Emails.update(email_id: id, scheduled_at: ...)`.

### Contacts

Contacts are team-global: one list per team, no audiences.

```ruby
contact = Posta::Contacts.create(
  email: "ada@acme.dev", first_name: "Ada", last_name: "Lovelace", unsubscribed: false,
  properties: { plan: "pro", seats: 3 },
  segments: [{ id: segment_id }],
  topics: [{ id: topic_id, subscription: "opt_in" }]
)
Posta::Contacts.get("ada@acme.dev") # by id or email; also resend-ruby's get(id: ...) / get(email: ...)
Posta::Contacts.update(id: contact[:id], unsubscribed: true, first_name: nil) # nil clears
Posta::Contacts.remove("ada@acme.dev")              # the contact's emails stay in the send log
Posta::Contacts.remove("ada@acme.dev", erase: true) # ?erase=true: also scrubs the address from email
                                                    # history, event payloads and API logs (GDPR/LGPD)
Posta::Contacts.list(limit: 50)
# Bulk read (Posta extension): carry the property map and the topic subscriptions on every
# item, so an audience reads in one request per 100 contacts instead of one per contact
Posta::Contacts.list(limit: 100, include: ["properties", "topics"]) # ?include=properties,topics

# Topic subscriptions (granular unsubscribe): PATCH /contacts/:id/topics
Posta::Contacts::Topics.update(email: "ada@acme.dev", topics: [{ id: topic_id, subscription: "opt_out" }]) # resend-ruby shape
Posta::Contacts.topics_update("ada@acme.dev", [{ id: topic_id, subscription: "opt_out" }])                 # positional
Posta::Contacts::Topics.list(email: "ada@acme.dev") # GET /contacts/:id/topics: every topic with its effective
                                                    # subscription (explicit: false when it is the topic's default)
                                                    # and its visibility ("public" | "private")

# Preference-center link (Posta extension): POST /contacts/:id/preferences-link
link = Posta::Contacts.preferences_link("ada@acme.dev") # by id or email; also preferences_link(id: ...) / (email: ...)
link[:url] # the contact's hosted preference page; no expiry, so show it only to that contact

# Segment membership: POST / DELETE /contacts/:id/segments/:segment_id
Posta::Contacts::Segments.add("ada@acme.dev", segment_id)
Posta::Contacts::Segments.remove(contact_id: contact[:id], segment_id: segment_id) # resend-ruby shape

# Bulk create (Posta extension): up to 1000 per call
result = Posta::Contacts::Batch.create(
  [{ email: "a@acme.dev" }, { email: "b@acme.dev", first_name: "B" }],
  on_conflict: "upsert",          # "error" (default) | "skip" | "upsert"
  batch_validation: "permissive"  # "strict" (default) | "permissive"
)
result[:data]   # [{ index:, id:, status: "created" | "updated" | "skipped" }]
result[:counts] # { created:, updated:, skipped:, failed: }
result[:errors] # permissive mode only: [{ index:, message: }]

# Bulk lookup (Posta extension): up to 1000 contacts by id or email in one request, in
# request order; unknown entries are listed, not errors: one request against the rate limit
found = Posta::Contacts::Batch.get([contact[:id], "b@acme.dev", { email: "c@acme.dev" }], include: ["topics"])
found[:data]    # [{ object: "contact", id:, email:, first_name:, last_name:, created_at:, unsubscribed:, topics: }]
found[:missing] # [{ index:, email: }] / [{ index:, id: }]: request entries that matched nobody

# Bulk delete (Posta extension): up to 1000 per call, exactly one of ids: / emails:
Posta::Contacts::Batch.remove(emails: ["a@acme.dev", "b@acme.dev"]) # or ids: [...]; emails stay in the log
Posta::Contacts::Batch.remove(ids: [contact[:id]], erase: true)      # also scrubs each address, as Contacts.remove
# => { data: [{ object: "contact", contact: "<uuid>", deleted: true }, ...] }, only the rows actually deleted
```

Contacts are addressable by id or email; when an `update` hash carries both, the email wins.
Emails are unique per team (case-insensitive): a duplicate `create` raises
`Posta::ValidationError`.

### Contact properties

Typed custom fields for contacts. `key` and `type` are fixed at creation.

```ruby
prop = Posta::ContactProperties.create(key: "plan", type: "string", fallback_value: "free")
Posta::ContactProperties.get(prop[:id])
Posta::ContactProperties.list(limit: 50)
Posta::ContactProperties.update(prop[:id], fallback_value: nil) # nil clears
Posta::ContactProperties.remove(prop[:id])
```

### Topics

```ruby
Posta::Topics.create(name: "Product updates", default_subscription: "opt_in", visibility: "public")
Posta::Topics.get(id)
Posta::Topics.list    # bare { data: [...] }: topics are unpaginated
Posta::Topics.update(id, name: "Product news")
Posta::Topics.remove(id)
```

### Broadcasts

```ruby
broadcast = Posta::Broadcasts.create(
  name: "Launch",           # internal name shown in the dashboard
  segment_id: segment[:id], # optional; omit segment_id and topic_id to send to all contacts
  topic_id: topic[:id],     # optional; only contacts subscribed to it receive it
  from: "Acme <news@acme.dev>",
  subject: "Launch",
  html: "<p>Hi {{{FIRST_NAME|there}}}</p>",
  text: "Hi",
  reply_to: "hello@acme.dev",
  preview_text: "It's here",
  send: false,              # true sends (or, with scheduled_at, schedules) instead of saving a draft
  scheduled_at: nil         # "2026-09-01T09:00:00Z" or "in 1 hour" (requires send: true)
)
Posta::Broadcasts.list
Posta::Broadcasts.get(broadcast[:id])
Posta::Broadcasts.update(broadcast[:id], subject: "Launch 🚀", topic_id: nil) # draft only; nil clears
Posta::Broadcasts.send(broadcast[:id], scheduled_at: "2026-09-01T09:00:00Z") # omit to send now
Posta::Broadcasts.cancel(broadcast[:id]) # scheduled only
Posta::Broadcasts.remove(broadcast[:id]) # draft only
```

### Suppressions

Addresses the API refuses to send to. Entries are addressable by id or by email.

```ruby
Posta::Suppressions.add(email: "bounced@example.com", origin: "manual") # origin: bounce | complaint | manual | unsubscribe
Posta::Suppressions.get("bounced@example.com")
Posta::Suppressions.list(limit: 50, origin: "bounce")
Posta::Suppressions.remove("bounced@example.com")

Posta::Suppressions::Batch.add(emails: ["a@example.com", "b@example.com"], origin: "unsubscribe") # up to 1000
Posta::Suppressions::Batch.remove(emails: ["a@example.com"])   # or ids: [...]
```

`Suppressions.create` is an alias of `Suppressions.add`.

### Domains

```ruby
domain = Posta::Domains.create(
  name: "acme.dev",
  region: "us-east-1",          # optional; a deployment serves one region
  custom_return_path: "send",   # optional
  open_tracking: true, click_tracking: true, tracking_subdomain: "links"
)
domain[:records] # DNS records to publish, each with its own status
Posta::Domains.get(domain[:id])
Posta::Domains.list
Posta::Domains.verify(domain[:id]) # re-check DNS now
Posta::Domains.update(domain[:id], open_tracking: false, click_tracking: true, tracking_subdomain: nil) # nil clears
Posta::Domains.remove(domain[:id])
```

### Webhooks

```ruby
hook = Posta::Webhooks.create(
  endpoint: "https://acme.dev/hooks/posta",
  events: ["email.delivered", "email.bounced", "email.complained"],
  signing_secret: "whsec_..." # optional: reuse an existing secret so the receiver keeps verifying
)
hook[:signing_secret]
Posta::Webhooks.get(hook[:id]) # also returns signing_secret and previous_secret_expires_at
Posta::Webhooks.list
Posta::Webhooks.update(hook[:id], events: ["email.opened"], status: "disabled")
Posta::Webhooks.remove(hook[:id])

# Rotate the signing secret (Posta extension): POST /webhooks/:id/rotate
rotated = Posta::Webhooks.rotate(hook[:id])                                         # mints a new secret, 24h overlap
rotated = Posta::Webhooks.rotate(hook[:id], signing_secret: "whsec_...", overlap_hours: 0) # bring your own, no overlap
rotated[:signing_secret]              # the secret now signing deliveries
rotated[:previous_secret_expires_at]  # ISO time until which the old secret also signs, or nil
```

During the overlap window (`overlap_hours`, 0 to 72, default 24) every delivery carries both
signatures, so a receiver holding either verifies; `Webhooks.get` reports the window's end
as `previous_secret_expires_at` (`nil` when none is open).

Events: `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`,
`email.complained`, `email.opened`, `email.clicked`, `contact.created`, `contact.updated`,
`contact.deleted`, `contact.unsubscribed`, `contact.resubscribed`, `contact.topic_opt_in`,
`contact.topic_opt_out`, `suppression.added`, `suppression.removed`, `deliverability.warning`,
`deliverability.paused`, `quota.warning`, `quota.reached`, `quota.paused`.

### API keys

```ruby
key = Posta::ApiKeys.create(name: "ci", permission: "sending_access", domain_id: domain[:id])
key[:token] # only returned here
Posta::ApiKeys.list
Posta::ApiKeys.remove(key[:id])
```

### Templates

Addressable by id or alias.

```ruby
tpl = Posta::Templates.create(name: "Welcome", html: "<p>Hi</p>", subject: "Welcome", text: "Hi", alias: "welcome")
Posta::Templates.get("welcome")
Posta::Templates.list
Posta::Templates.update("welcome", subject: nil, alias: nil) # nil clears subject/text/alias
Posta::Templates.publish(tpl[:id])   # freezes the draft as the next version; sends use published versions
Posta::Templates.duplicate(tpl[:id]) # returns the copy's id
Posta::Templates.remove(tpl[:id])
```

Resend's `from`, `reply_to` and `variables` template fields are passed through untouched; the
server currently answers 422 for them.

### Segments (Posta extension)

Dynamic segments are a saved filter over the team's contacts: a Posta superset with
no Resend equivalent.

```ruby
segment = Posta::Segments.create(
  name: "Pro plan",
  filter: { match: "all", conditions: [{ field: "property:plan", op: "equals", value: "pro" }] }
)
Posta::Segments.get(segment[:id]) # includes a live contact_count
Posta::Segments.list
Posta::Segments.contacts(segment[:id], limit: 50) # the contacts currently matching
Posta::Segments.contacts(segment[:id], include: ["properties", "topics"]) # with each contact's extras, as Contacts.list
Posta::Segments.update(segment[:id], name: "Pro tier")
Posta::Segments.remove(segment[:id])
```

### Usage (Posta extension)

```ruby
usage = Posta::Usage.get # GET /usage
usage[:plan]                   # "free" | "pro" | "scale" | nil (self-hosted)
usage[:limits]                 # { emails_per_day:, domains: }: nil means unlimited
usage[:today]                  # { emails_sent:, resets_at: }
```

### Deliverability (Posta extension)

Per-email best-practice insights and the account-level deliverability score.

```ruby
insights = Posta::Emails.get_insights(email[:id]) # score, band, checks: [{id:, severity:, status:, penalty:, detail:}]
account  = Posta::Deliverability.get              # GET /deliverability: trailing-30-day account score
puts account[:score] # 0-10 (one decimal) or nil when there is not enough data
```

Check ids and the band/severity/status values are an open set that grows across score
versions: treat them as strings, not a closed enum.

## Error handling

No `{ data, error }` tuple: a non-2xx response raises. The base class is `Posta::Error`,
which carries `#status_code`, `#name` (the stable snake_case discriminant), and `#message`.
Subclasses are keyed on `name`, so you can rescue a specific failure:

```ruby
begin
  Posta::Emails.get(id)
rescue Posta::NotFoundError => e
  warn "no such email: #{e.message}"
rescue Posta::Error => e
  warn "#{e.name} (#{e.status_code || 'transport'}): #{e.message}"
end
```

Subclasses: `ValidationError`, `AllRecipientsSuppressedError`, `NotFoundError`,
`MissingApiKeyError`, `InvalidApiKeyError`, `RestrictedApiKeyError`, `SendingPausedError`,
`BroadcastsPausedError`, `RateLimitExceededError`, `DailyQuotaExceededError`,
`InvalidIdempotentRequestError`, `ConcurrentIdempotentRequestsError`, `InternalServerError`, and
`ApplicationError` (the fallback for unknown names). Client-side and
transport failures that never reached the API raise `ApplicationError` with `#status_code == nil`.

`Emails.send` and `Batch.send` raise `AllRecipientsSuppressedError` (`all_recipients_suppressed`,
422) when every `to` recipient is on the suppression list or opted out of the send's `topic_id`.

## Migrating from Resend

```diff
- require "resend"
- Resend.api_key = "re_123"
- Resend::Emails.send(from: "...", to: "...", subject: "Hi", html: "<p>hi</p>")
+ require "posta"
+ Posta.api_key  = "po_123"
+ Posta.base_url = "https://mail.acme.dev" # self-hosted only
+ Posta::Emails.send(from: "...", to: "...", subject: "Hi", html: "<p>hi</p>")
```

Method names, nesting and payloads match; `options: { idempotency_key:, batch_validation: }`
works as in resend-ruby. Notes:

- **`update` takes the id first.** On domains, webhooks, contact properties, topics, broadcasts
  and segments it is `update(id, params)` where resend-ruby takes one hash carrying the id
  (`:id`, `:topic_id`, `:broadcast_id`, `:segment_id`); templates already match resend-ruby's
  `update(id, params)`, `Contacts.update` keeps resend's single-hash shape, and `Emails.update`
  accepts both.
- `Contacts` member methods and `Contacts::Segments` / `Contacts::Topics` accept resend-ruby's
  addressing hashes (`id:` / `email:` / `contact_id:`, `segment_id:`) as well as bare values.
  `Contacts::Topics.list` is unpaginated, so resend-ruby's `limit:`/`after:`/`before:` are not sent.
  `Suppressions::Batch` is nested as in resend-ruby.
- **No audiences**: contacts are team-global, so there is no `Audiences` resource and no
  `audience_id` params. The API's `/audiences/*` routes are a compatibility shim and are not
  part of this SDK. `Posta::Segments` is the dynamic-filter feature (`/segments`), not
  Resend's audiences alias.
- Not in the API (yet), so not here: broadcast recipients/clicked links, email sharing and
  metrics, contact imports, receiving, automations, logs, OAuth grants, webhook event replay.
- Posta extensions with no Resend counterpart: `Segments`, `Contacts::Batch`,
  `Contacts.preferences_link`, `Webhooks.rotate`, `Usage`, `Deliverability`,
  `Emails.get_insights`, `Suppressions` `origin: "unsubscribe"`.

## License

MIT

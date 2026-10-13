# millionsend

Official Elixir SDK for [MillionSend](https://github.com/MillionSend/millionsend) — a self-hostable, Resend-compatible email API on AWS SES.

The API is wire-compatible with Resend, and this SDK mirrors the shape of
[`resend-elixir`](https://hex.pm/packages/resend), so migrating is mostly a
find-and-replace: swap the module prefix (and, if you self-host, point `base_url`
at your instance).

## Install

```elixir
# mix.exs
def deps do
  [{:millionsend, "~> 0.8"}]
end
```

Requires Elixir 1.15+. HTTP is handled by [Req](https://hex.pm/packages/req).

## Quickstart

```elixir
config :millionsend, MillionSend.Client,
  api_key: System.get_env("MILLIONSEND_API_KEY")
# Self-hosting? Add base_url: "https://mail.acme.dev" to point at your instance.
```

```elixir
case MillionSend.Emails.send(%{
       from: "Acme <onboarding@acme.dev>",
       to: "success@simulator.amazonses.com",
       subject: "Hello from MillionSend",
       html: "<strong>It works!</strong>"
     }) do
  {:ok, email} -> IO.puts("sent #{email.id}")
  {:error, error} -> IO.puts("#{error.name}: #{error.message}")
end
```

## Configuration

Two interchangeable styles, use whichever fits:

```elixir
# 1. Application env — every call works without an explicit client.
config :millionsend, MillionSend.Client,
  api_key: "ms_123",
  base_url: "https://mail.acme.dev"

MillionSend.Emails.get("email-id")

# 2. An explicit client passed as the first argument.
client = MillionSend.client(api_key: "ms_123", base_url: "https://mail.acme.dev")
MillionSend.Emails.get(client, "email-id")
```

Resolution precedence for each option: explicit `MillionSend.client/1` opts →
`config :millionsend, MillionSend.Client` → OS environment
(`MILLIONSEND_API_KEY`, `MILLIONSEND_BASE_URL`) → defaults.

- `api_key` is required; missing everywhere raises `ArgumentError`.
- `base_url` defaults to MillionSend Cloud (`https://api.millionsend.com`), so
  Cloud works with just the key. A self-hosted instance sets its own origin here.
- `allow_insecure_http` (optional, default `false`). Plain `http://` is only accepted
  for loopback hosts (`localhost`, `127.0.0.1`, `::1`); any other `http://` URL raises
  `ArgumentError`, since the API key is sent as a bearer header. Set it to `true` to
  talk to a non-TLS instance elsewhere (e.g. inside a private network).
- `user_agent` (optional) appends a suffix after the SDK's own User-Agent token.
- `http_client` (optional) swaps the HTTP layer — any module implementing the
  `MillionSend.HTTP` behaviour (used to stub requests in tests).

Every function accepts an optional leading `client` argument; omit it to use the
configured default.

## Payloads

Input maps are sent to the API exactly as written — atom or string keys,
snake_case names, and every key you pass reaches the wire (an explicit `nil`
is sent as JSON `null`, which clears a nullable field on update). The API
validates the payload and rejects what it does not accept, so nothing is
silently dropped on the way out.

## Errors

No function raises for an API error — each returns `{:ok, struct}` or
`{:error, %MillionSend.Error{}}`. The error's `name` is a stable snake_case code
you can match on (`"validation_error"`, `"not_found"`, `"restricted_api_key"`,
`"sending_paused"`, …). Client-side and transport failures carry
`status_code: nil`. `Emails.send/2` and `send_batch/2` answer a 422
`"all_recipients_suppressed"` when every `to` recipient is on the suppression
list or opted out of the send's `topic_id`.

```elixir
case MillionSend.Emails.get(id) do
  {:ok, email} -> email
  {:error, %MillionSend.Error{name: "not_found"}} -> :gone
  {:error, error} -> {:error, error.status_code, error.message}
end
```

`MillionSend.Error` is also an exception, so you can `raise`/`Exception.message/1`
it if you prefer to bubble failures up.

## Resources

### Emails

```elixir
MillionSend.Emails.send(%{
  from: "Acme <onboarding@acme.dev>",
  to: ["ada@acme.dev"],                       # string or list; same for cc/bcc/reply_to
  subject: "Hello",
  html: "<p>Hi</p>", text: "Hi",
  reply_to: "support@acme.dev",
  scheduled_at: "in 2 hours",                 # ISO 8601 or relative
  tags: [%{name: "campaign", value: "welcome"}],
  topic_id: topic_id,                         # opted-out recipients are skipped
  attachments: [%{filename: "hi.txt", content: Base.encode64("hi"), content_type: "text/plain"}],
  headers: %{"X-Entity-Ref-ID" => "42"}
}, idempotency_key: key)                      # POST /emails

MillionSend.Emails.get(id)                    # GET /emails/:id (includes score)
MillionSend.Emails.list(limit: 50, after: cursor)  # GET /emails
MillionSend.Emails.update(id, scheduled_at: "in 1 day")  # PATCH /emails/:id (scheduled only)
MillionSend.Emails.cancel(id)                 # POST /emails/:id/cancel (scheduled only)
MillionSend.Emails.remove(id)                 # DELETE /emails/:id
MillionSend.Emails.get_insights(id)           # GET /emails/:id/insights
```

Batches take up to 100 emails. Strict validation (the default) is
all-or-nothing and returns a plain list; `batch_validation: :permissive` sends
the `x-batch-validation` header, writes the valid subset and returns a
`MillionSend.Emails.BatchResponse` with the rejected items in `errors`:

```elixir
{:ok, [%{id: _}, %{id: _}]} =
  MillionSend.Emails.send_batch([a, b], idempotency_key: key)       # POST /emails/batch

{:ok, %MillionSend.Emails.BatchResponse{data: sent, errors: errors}} =
  MillionSend.Emails.send_batch([a, b], batch_validation: :permissive)
errors  # [%MillionSend.BatchError{index: 1, message: "..."}]
```

### Contacts

Contacts are team-global — one per email per team (case-insensitive) — and
addressable by id or email.

```elixir
MillionSend.Contacts.create(%{
  email: "ada@acme.dev", first_name: "Ada", last_name: "Lovelace",
  unsubscribed: false, properties: %{plan: "pro"},
  segments: [%{id: segment_id}],
  topics: [%{id: topic_id, subscription: :opt_in}]
})
MillionSend.Contacts.get(%{email: "ada@acme.dev"})     # id or email (email wins)
MillionSend.Contacts.get("contact-uuid")               # bare id works too
MillionSend.Contacts.update(%{id: id, unsubscribed: true, first_name: nil})  # nil clears
MillionSend.Contacts.remove(%{email: "ada@acme.dev"})               # emails stay in the send log
MillionSend.Contacts.remove(%{email: "ada@acme.dev"}, erase: true)  # also scrubs the address from history and logs (GDPR/LGPD)
MillionSend.Contacts.list(limit: 50, after: cursor)
MillionSend.Contacts.list(include: [:properties, :topics])   # ?include= attaches both to every item
MillionSend.Contacts.batch_remove(%{emails: ["a@acme.dev"]})   # or %{ids: [...]}; up to 1000; emails stay in the send log
MillionSend.Contacts.batch_remove(%{ids: [id], erase: true})    # also scrubs each address from history and logs

# Bulk read (up to 1000) by id or email in one request; unknown entries land in
# missing instead of failing the call.
{:ok, %MillionSend.Contacts.BatchGetResponse{data: contacts, missing: missing}} =
  MillionSend.Contacts.batch_get(["contact-uuid", %{email: "b@acme.dev"}], include: [:topics])
contacts  # [%MillionSend.Contacts.Contact{id: ..., topics: [%MillionSend.Contacts.TopicSubscription{}, ...]}]
missing   # [%MillionSend.Contacts.BatchGetResponse.Missing{index: 1, email: "b@acme.dev"}]

# Bulk create (up to 1000). on_conflict: :error (default) | :skip | :upsert;
# batch_validation: :strict (default) | :permissive.
{:ok, %MillionSend.Contacts.BatchResponse{data: items, counts: counts, errors: errors}} =
  MillionSend.Contacts.create_batch([%{email: "a@acme.dev"}, %{email: "b@acme.dev"}],
                                    on_conflict: :upsert, batch_validation: :permissive)
items   # [%MillionSend.Contacts.BatchResponse.Item{index: 0, id: ..., status: "created"}, ...]
counts  # %{created: 2, updated: 0, skipped: 0, failed: 0}

# Segment membership
MillionSend.Contacts.add_to_segment(%{email: "ada@acme.dev"}, segment_id)
MillionSend.Contacts.remove_from_segment(contact_id, segment_id)

# Topic subscriptions (granular unsubscribe)
MillionSend.Contacts.update_topics(%{email: "ada@acme.dev",
                                     topics: [%{id: topic_id, subscription: :opt_out}]})
{:ok, %MillionSend.List{data: topics}} = MillionSend.Contacts.list_topics(%{email: "ada@acme.dev"})
topics  # [%MillionSend.Contacts.TopicSubscription{id: ..., name: ..., subscription: "opt_out", explicit: true}, ...]
        # explicit: false means the contact inherits the topic's default_subscription

# Hosted preference page (the one the contact's unsubscribe links open)
{:ok, link} = MillionSend.Contacts.preferences_link(%{email: "ada@acme.dev"})
link.url   # signed, contact-scoped, no expiry — hand it only to the contact
```

### Contact properties

```elixir
MillionSend.ContactProperties.create(%{key: "plan", type: :string, fallback_value: "free"})
MillionSend.ContactProperties.list()
MillionSend.ContactProperties.get(id)
MillionSend.ContactProperties.update(id, %{fallback_value: nil})   # nil clears
MillionSend.ContactProperties.remove(id)
```

### Topics

```elixir
MillionSend.Topics.create(%{name: "Product updates", default_subscription: :opt_in,
                            visibility: :public})
MillionSend.Topics.get(id)
MillionSend.Topics.list()      # a plain list — topics are unpaginated
MillionSend.Topics.update(id, %{description: "Monthly digest"})
MillionSend.Topics.remove(id)
```

### Broadcasts

```elixir
# Target with segment_id: and/or topic_id:; omit both to send to all contacts.
{:ok, broadcast} = MillionSend.Broadcasts.create(%{
  name: "Launch", from: "Acme <news@acme.dev>", subject: "Launch",
  html: "<p>Hi {{{FIRST_NAME|there}}}</p>", preview_text: "It's here",
  reply_to: "hello@acme.dev", topic_id: topic_id
})
MillionSend.Broadcasts.create(%{..., send: true, scheduled_at: "in 1 hour"})  # create and schedule
MillionSend.Broadcasts.list()
MillionSend.Broadcasts.get(id)
MillionSend.Broadcasts.update(id, %{subject: "Launch 🚀", topic_id: nil})  # draft only; nil clears
MillionSend.Broadcasts.send(id, scheduled_at: "2026-09-01T09:00:00Z")  # omit to send now
MillionSend.Broadcasts.cancel(id)                                      # scheduled only
MillionSend.Broadcasts.remove(id)                                      # draft only
```

### Segments

A segment with a `filter` is dynamic — a saved query over the team's contacts
(a MillionSend extension; Resend segments are static lists). Without a filter
it is a plain list you add contacts to.

```elixir
MillionSend.Segments.create(%{
  name: "Pro plan",
  filter: %{match: :all, conditions: [%{field: "property:plan", op: "equals", value: "pro"}]}
})
MillionSend.Segments.get(id)   # includes a live contact_count
MillionSend.Segments.list()
MillionSend.Segments.list_contacts(id, limit: 50, include: [:properties])
MillionSend.Segments.update(id, %{name: "Pro tier"})
MillionSend.Segments.remove(id)
```

### Suppressions

Addresses that are never sent to. Entries come from bounces, complaints and
unsubscribes, or are added here; `origin` is `bounce | complaint | manual |
unsubscribe`.

```elixir
MillionSend.Suppressions.create(%{email: "gone@example.com", origin: :manual})
MillionSend.Suppressions.get("gone@example.com")           # id or email
MillionSend.Suppressions.list(origin: :bounce, limit: 50)
MillionSend.Suppressions.remove(id)
MillionSend.Suppressions.batch_add(["a@example.com", "b@example.com"], origin: :unsubscribe)
MillionSend.Suppressions.batch_remove(%{emails: ["a@example.com"]})   # or %{ids: [...]}
```

### Domains

```elixir
{:ok, domain} = MillionSend.Domains.create(%{name: "acme.dev", region: "us-east-1",
                                             open_tracking: true, tracking_subdomain: "links"})
domain.records   # [%MillionSend.Domains.Domain.Record{record: "DKIM", name: ..., value: ...}, ...]
MillionSend.Domains.list()
MillionSend.Domains.get(id)
MillionSend.Domains.verify(id)
MillionSend.Domains.update(id, %{click_tracking: true, tracking_subdomain: nil})  # nil clears
MillionSend.Domains.remove(id)
```

### API keys

```elixir
{:ok, key} = MillionSend.ApiKeys.create(%{name: "ci", permission: :sending_access, domain_id: id})
key.token        # shown once — store it
MillionSend.ApiKeys.list()
MillionSend.ApiKeys.remove(id)
```

### Webhooks

```elixir
{:ok, hook} = MillionSend.Webhooks.create(%{
  endpoint: "https://acme.dev/hooks/email",
  events: ["email.delivered", "email.bounced", "email.complained"]
})
hook.signing_secret
MillionSend.Webhooks.list()
MillionSend.Webhooks.get(id)                 # includes signing_secret and previous_secret_expires_at
MillionSend.Webhooks.update(id, %{status: :disabled})
MillionSend.Webhooks.remove(id)

# Rotate the signing secret. For overlap_hours (0..72) deliveries carry both
# signatures, so the receiver can switch without a gap. Pass signing_secret:
# to install your own whsec_ value instead of a minted one.
{:ok, rotated} = MillionSend.Webhooks.rotate(id, overlap_hours: 24)
rotated.signing_secret
rotated.previous_secret_expires_at           # nil when overlap_hours: 0
```

Events include `email.*`, `deliverability.*`, `quota.*`, `contact.*`
(`created`, `updated`, `deleted`, `unsubscribed`, `resubscribed`,
`topic_opt_in`, `topic_opt_out`) and `suppression.*` (`added`, `removed`).

### Templates

Every member function takes the template id or its `alias`.

```elixir
MillionSend.Templates.create(%{name: "Welcome", alias: "welcome", subject: "Hi!",
                               html: "<p>Hi</p>", text: "Hi"})
MillionSend.Templates.list()
MillionSend.Templates.get("welcome")
MillionSend.Templates.update("welcome", %{subject: nil})   # nil clears subject/text/alias
MillionSend.Templates.duplicate("welcome")
MillionSend.Templates.publish("welcome")     # no-op kept for compatibility: templates publish on write
MillionSend.Templates.remove("welcome")
```

### Deliverability (MillionSend extension)

Deliverability scores are 0–10 with one decimal. `MillionSend.Emails.get/2`
returns the email's `score` (`nil` when no insights exist);
`get_insights/2` returns the full per-email report (a `"not_found"` error until
insights exist); `MillionSend.Deliverability.get/1` returns the account-level
score over the trailing window (`nil` scores until there is enough data).

```elixir
{:ok, insights} = MillionSend.Emails.get_insights(id)  # GET /emails/:id/insights
insights.score          # 8.5
insights.band           # "excellent" | "good" | "needs_attention" | "at_risk"
insights.checks         # [%MillionSend.Emails.Insights.Check{id: ..., severity: ..., status: ..., penalty: ..., detail: ...}]

{:ok, report} = MillionSend.Deliverability.get()       # GET /deliverability
report.score            # 8.7 (nil until enough data)
report.guardrail_status # "ok" | "warning" | "paused"
```

### Usage (MillionSend extension)

```elixir
{:ok, usage} = MillionSend.Usage.get()      # GET /usage
usage.plan                                  # "free" | "pro" | "scale" | nil (self-hosted)
usage.limits["emails_per_day"]              # nil = unlimited / self-hosted
usage.today["emails_sent"]
```

## Migrating from Resend

```diff
- {:ok, email} = Resend.Emails.send(%{from: ..., to: ..., subject: ..., html: ...})
+ {:ok, email} = MillionSend.Emails.send(%{from: ..., to: ..., subject: ..., html: ...})
```

```diff
- config :resend, api_key: "re_123"
+ config :millionsend, MillionSend.Client, api_key: "ms_123"   # self-hosted: add base_url: "https://mail.acme.dev"
```

Module names, function names and payloads match. Notes:

- **No audiences.** Contacts are team-global; drop the `audience_id` from
  `contacts.*` calls. The `/audiences/...` compatibility routes are not part of
  this SDK. Target broadcasts with a `segment_id` and/or a `topic_id` instead.
- **Segment filters, deliverability insights and usage** are MillionSend
  extensions with no Resend counterpart.
- `Templates.publish/2` is a no-op: templates are published on every write.

## Testing against a real instance

The suite is fully mocked. An opt-in end-to-end test runs only when
`MILLIONSEND_API_KEY` is set (and `MILLIONSEND_BASE_URL` for a self-hosted instance):

```bash
MILLIONSEND_API_KEY=ms_... MILLIONSEND_BASE_URL=http://localhost:3001 mix test
```

## License

MIT

# millionsend

Official Python SDK for [MillionSend](https://github.com/MillionSend/millionsend) — a self-hostable, [Resend](https://resend.com)-compatible email API on AWS SES.

The API is wire-compatible with Resend and this SDK deliberately mirrors the shape of the `resend` PyPI package, so migrating is mostly a find-and-replace: swap the import and the key. MillionSend Cloud works with just the key; a self-hosted instance also sets `base_url`.

## Install

```bash
pip install millionsend
```

Requires Python 3.9+. Depends only on `requests`.

## Quickstart

```python
import millionsend

millionsend.api_key = "ms_123"
millionsend.base_url = "https://mail.acme.dev"  # self-hosted only; omit for MillionSend Cloud

email = millionsend.Emails.send({
    "from": "Acme <onboarding@acme.dev>",
    "to": "success@simulator.amazonses.com",
    "subject": "Hello from MillionSend",
    "html": "<strong>It works!</strong>",
})

print(email.id)  # responses support both email["id"] and email.id
```

## Configuration

Config is module-level (no client object to construct):

```python
import millionsend

millionsend.api_key  = "ms_123"                  # or env MILLIONSEND_API_KEY
millionsend.base_url = "https://mail.acme.dev"   # or env MILLIONSEND_BASE_URL
millionsend.timeout  = 30                        # optional, seconds (default 60)
millionsend.allow_insecure_http = False          # accept a non-loopback http:// base_url
```

- `api_key` falls back to `MILLIONSEND_API_KEY`. Missing key raises `MissingApiKeyError` on the first call.
- `base_url` falls back to `MILLIONSEND_BASE_URL`, then `https://api.millionsend.com` (MillionSend Cloud). Self-hosting? Set it to your instance's origin.
- Plain `http://` is only accepted for loopback hosts (`localhost`, `127.0.0.1`, `::1`); any other `http://` URL raises `MillionSendError` on the first call, since the API key is sent as a bearer header. Set `millionsend.allow_insecure_http = True` to talk to a non-TLS instance elsewhere (e.g. inside a private network).

Request/response casing: request params are plain dicts in the API's `snake_case` (`reply_to`, `scheduled_at`, `first_name`) and are sent to the wire as given — nothing is filtered or renamed. Responses are `dict` subclasses that also allow attribute access (`resp.id`, `resp.data[0].id`).

List methods take keyword arguments (`list(limit=50, after=cursor)`) or resend-python's params dict (`list({"limit": 50, "after": cursor})`).

### Request options

`Emails.send`, `Batch.send` and `Contacts.Batch.create` take resend-python's options dict as the second argument, or the same values as keywords:

```python
millionsend.Emails.send(payload, {"idempotency_key": "order-42"})
millionsend.Emails.send(payload, idempotency_key="order-42")

millionsend.Batch.send(payloads, {"idempotency_key": "batch-1", "batch_validation": "permissive"})
millionsend.Batch.send(payloads, batch_validation="permissive")
```

- `idempotency_key` → `Idempotency-Key` header (POST only). A replay with the same key and body returns the original ids; a different body raises `InvalidIdempotentRequestError`.
- `batch_validation` → `x-batch-validation` header: `"strict"` (default) rejects the whole batch on the first invalid item; `"permissive"` processes the valid items and lists the rest in the response's `errors[]` (`{index, message}`).

## Errors

Every call raises on a non-2xx response. The base is `MillionSendError`; known error names map to subclasses so you can catch them:

```python
from millionsend import NotFoundError, MillionSendError

try:
    contact = millionsend.Contacts.get(email="ghost@acme.dev")
except NotFoundError:
    ...  # 404
except MillionSendError as e:
    print(e.code, e.status_code, e.message)
```

- `e.code` is the stable `name` discriminant (`validation_error`, `not_found`, `restricted_api_key`, `sending_paused`, `invalid_idempotent_request`, …).
- `e.status_code` is the HTTP status, or `None` for client-side/transport failures (connection refused, DNS, timeout).
- `Emails.send` / `Batch.send` raise `AllRecipientsSuppressedError` (422 `all_recipients_suppressed`) when every `to` recipient is on the suppression list or opted out of the send's `topic_id`.

Subclasses: `MissingApiKeyError`, `InvalidApiKeyError`, `ValidationError`, `AllRecipientsSuppressedError`, `InvalidParameterError`, `InvalidPayloadError`, `PayloadTooLargeError`, `NotFoundError`, `ConflictError`, `ForbiddenError`, `RestrictedApiKeyError`, `SendingPausedError`, `RateLimitExceededError`, `DailyQuotaExceededError`, `PlanLimitReachedError`, `InvalidIdempotentRequestError`, `ConcurrentIdempotentRequestsError`, `InternalServerError`, `ApplicationError`. Unknown names raise the base `MillionSendError`.

## Resources

### Emails

```python
millionsend.Emails.send({
    "from": "Acme <onboarding@acme.dev>",
    "to": ["ada@acme.dev"],
    "cc": "ops@acme.dev",
    "bcc": ["audit@acme.dev"],
    "reply_to": "support@acme.dev",
    "subject": "Your receipt",
    "html": "<p>Thanks!</p>",
    "text": "Thanks!",
    "scheduled_at": "in 2 hours",                        # or ISO 8601 with offset
    "tags": [{"name": "category", "value": "receipt"}],
    "topic_id": topic.id,                                # skip recipients opted out of the topic
    "headers": {"X-Entity-Ref-ID": "order-42"},
    "attachments": [{
        "filename": "receipt.pdf",
        "content": base64_pdf,                           # base64 string
        "content_type": "application/pdf",               # optional
        "content_id": "receipt",                         # optional, for cid: references
    }],
}, idempotency_key="order-42")

millionsend.Emails.get(email_id)                              # GET /emails/{id} (includes a nullable 0-10 `score`)
millionsend.Emails.list(limit=50, after=cursor)               # GET /emails
millionsend.Emails.update({"id": email_id, "scheduled_at": "2026-09-01T09:00:00Z"})  # PATCH, scheduled only
millionsend.Emails.cancel(email_id)                           # POST /emails/{id}/cancel (scheduled only)
millionsend.Emails.remove(email_id)                           # DELETE /emails/{id}
millionsend.Emails.get_insights(email_id)                     # GET /emails/{id}/insights (404 until computed)

millionsend.Batch.send([payload_a, payload_b], batch_validation="permissive")  # up to 100; see `errors`
```

`to` / `cc` / `bcc` / `reply_to` accept a string or a list of strings. `template` is passed through too; the server answers 422 until templates can be sent from.

### Contacts

Contacts are team-global — one record per email address, no audiences to manage.

```python
millionsend.Contacts.create({
    "email": "ada@acme.dev",
    "first_name": "Ada",
    "last_name": "Lovelace",
    "unsubscribed": False,
    "properties": {"plan": "pro", "seats": 3},
    "segments": [{"id": segment.id}],
    "topics": [{"id": topic.id, "subscription": "opt_in"}],
})
millionsend.Contacts.get(email="ada@acme.dev")  # by id or email (email wins)
millionsend.Contacts.get("contact-id")          # bare id works too, as does resend's id="contact-id"
millionsend.Contacts.update({"id": "contact-id", "unsubscribed": True, "first_name": None})  # None clears
millionsend.Contacts.update({"email": "ada@acme.dev", "properties": {"plan": None}})       # None removes the key
millionsend.Contacts.remove(email="ada@acme.dev")              # the contact's emails stay in the send log
millionsend.Contacts.remove(email="ada@acme.dev", erase=True)  # ?erase=true — also scrubs the address from email history, event payloads and API logs (GDPR/LGPD erasure)
millionsend.Contacts.preferences_link(email="ada@acme.dev").url  # hosted preference page (MillionSend extension); no expiry, hand it only to the contact
millionsend.Contacts.list(limit=50)
millionsend.Contacts.list(segment_id=segment.id)  # GET /segments/{id}/contacts
# Bulk read (MillionSend extension): attach properties and topic subscriptions to every item,
# so an audience reads in one request per 100 contacts instead of one per contact
millionsend.Contacts.list(limit=100, include=["properties", "topics"])  # ?include=properties,topics

# Bulk create (MillionSend extension) — up to 1000 per call
result = millionsend.Contacts.Batch.create(
    [{"email": "a@acme.dev"}, {"email": "b@acme.dev", "first_name": "B"}],
    on_conflict="upsert",            # error (default) | skip | upsert
    batch_validation="permissive",   # strict (default) | permissive
)
result.data[0].status  # created | updated | skipped
result.counts.failed
result.errors          # permissive mode: [{index, message}]

# Bulk lookup (MillionSend extension) — up to 1000 contacts by id or email in one request, in request order;
# unknown entries are listed under `missing`, not errors — one request against the rate limit
result = millionsend.Contacts.Batch.get(["contact-id", {"email": "ada@acme.dev"}], include=["topics"])
result.data     # [{object: "contact", id, email, ..., topics}] — the contacts found
result.missing  # [{index, email}] — request entries that matched nobody

# Bulk delete (MillionSend extension) — {"ids": [...]} or {"emails": [...]}, up to 1000; data lists only the rows deleted.
# Emails stay in the send log; erase=True also scrubs each address from email history, event payloads and API logs
millionsend.Contacts.Batch.remove({"emails": ["a@acme.dev", "b@acme.dev"]})
millionsend.Contacts.Batch.remove({"emails": ["a@acme.dev"]}, erase=True)  # body {"emails": [...], "erase": true}

# Segment membership — mirrors resend's contacts.segments
millionsend.Contacts.Segments.add({"contact_id": "contact-id", "segment_id": segment.id})
millionsend.Contacts.Segments.remove({"email": "ada@acme.dev", "segment_id": segment.id})

# Topic subscriptions (granular unsubscribe) — mirrors resend's contacts.topics
millionsend.Contacts.Topics.update({
    "email": "ada@acme.dev",
    "topics": [{"id": "topic-id", "subscription": "opt_out"}],
})
topics = millionsend.Contacts.Topics.list(email="ada@acme.dev")  # GET /contacts/{idOrEmail}/topics
for t in topics.data:
    print(t.name, t.subscription, t.explicit, t.visibility)  # subscription is the effective choice; explicit=False means the topic default applies; the preference page lists public topics only
```

Creating a contact whose email already exists on the team (case-insensitive) answers 409 and raises `ValidationError`.

### Contact properties

Property definitions for the `properties` map on contacts.

```python
prop = millionsend.ContactProperties.create({"key": "plan", "type": "string", "fallback_value": "free"})
millionsend.ContactProperties.list()
millionsend.ContactProperties.get(prop.id)
millionsend.ContactProperties.update({"id": prop.id, "fallback_value": None})  # None clears
millionsend.ContactProperties.remove(prop.id)
```

### Topics

```python
millionsend.Topics.create({"name": "Product updates", "default_subscription": "opt_in"})
millionsend.Topics.get(topic_id)
millionsend.Topics.list()      # bare {"data": [...]} — topics are unpaginated
millionsend.Topics.update(topic_id, {"name": "Product news", "visibility": "public"})
millionsend.Topics.remove(topic_id)
```

### Broadcasts

Target a saved segment (`segment_id`) and/or a topic (`topic_id`); set neither to send to every contact.

```python
broadcast = millionsend.Broadcasts.create({
    "name": "September launch",   # internal, optional
    "segment_id": segment.id,     # optional
    "topic_id": topic.id,         # optional
    "from": "Acme <news@acme.dev>",
    "reply_to": "support@acme.dev",
    "subject": "Launch",
    "preview_text": "It's here",
    "html": "<p>Hi {{{FIRST_NAME|there}}}</p>",
    "text": "Hi there",
    "send": False,                # True sends (or schedules) instead of saving a draft
    "scheduled_at": "in 1 hour",  # with send: True
})
millionsend.Broadcasts.list()
millionsend.Broadcasts.get(broadcast.id)
millionsend.Broadcasts.update(broadcast.id, {"subject": "Launch 🚀", "topic_id": None})  # draft only; None clears
millionsend.Broadcasts.update({"broadcast_id": broadcast.id, "subject": "Launch"})        # resend-python shape
millionsend.Broadcasts.send(broadcast.id, scheduled_at="2026-09-01T09:00:00Z")  # omit to send now
millionsend.Broadcasts.send({"broadcast_id": broadcast.id})                      # resend-python shape
millionsend.Broadcasts.cancel(broadcast.id)  # scheduled only
millionsend.Broadcasts.remove(broadcast.id)  # draft only
```

### Segments (MillionSend extension)

Dynamic segments are a saved filter over the team's contacts — a MillionSend feature with **no Resend equivalent**.

```python
segment = millionsend.Segments.create({
    "name": "Pro plan",
    "filter": {"match": "all", "conditions": [   # optional; omit or None = every contact
        {"field": "property:plan", "op": "equals", "value": "pro"},
    ]},
})
millionsend.Segments.get(segment.id)   # includes a live contact_count
millionsend.Segments.list()
millionsend.Segments.update(segment.id, {"name": "Pro tier"})
millionsend.Segments.remove(segment.id)
```

### Suppressions

Addresses the API refuses to send to. Addressable by id or email.

```python
millionsend.Suppressions.add({"email": "bounced@acme.dev", "origin": "manual"})  # origin: bounce | complaint | manual | unsubscribe
millionsend.Suppressions.get("bounced@acme.dev")
millionsend.Suppressions.list(origin="bounce", limit=50)
millionsend.Suppressions.remove("bounced@acme.dev")

millionsend.Suppressions.Batch.add({"emails": ["a@acme.dev", "b@acme.dev"], "origin": "unsubscribe"})  # up to 1000
millionsend.Suppressions.Batch.remove({"emails": ["a@acme.dev"]})   # or {"ids": [...]}
```

`Suppressions.create` is an alias of `add`.

### Domains

```python
domain = millionsend.Domains.create({
    "name": "acme.dev",
    "region": "us-east-1",           # optional; must match the deployment's SES region
    "custom_return_path": "send",    # optional
    "open_tracking": True,           # optional
    "click_tracking": True,          # optional
    "tracking_subdomain": "links",   # optional; links.acme.dev
})
for record in domain.records:        # DNS records to publish
    print(record.type, record.name, record.value)

millionsend.Domains.list()
millionsend.Domains.get(domain.id)
millionsend.Domains.verify(domain.id)
millionsend.Domains.update({"id": domain.id, "open_tracking": False, "tracking_subdomain": None})
millionsend.Domains.remove(domain.id)
```

### Webhooks

```python
webhook = millionsend.Webhooks.create({
    "endpoint": "https://acme.dev/hooks/millionsend",
    "events": ["email.delivered", "email.bounced", "email.complained"],
    "signing_secret": "whsec_...",   # optional: reuse a secret instead of minting one
})
webhook.signing_secret               # also returned by get()

millionsend.Webhooks.list()
millionsend.Webhooks.get(webhook.id)
millionsend.Webhooks.update({"webhook_id": webhook.id, "status": "disabled"})  # endpoint, events, status
millionsend.Webhooks.remove(webhook.id)

# Rotate the signing secret (MillionSend extension). For overlap_hours (default 24, max 72) deliveries
# carry both signatures, so the receiver can switch without a gap; 0 drops the old secret at once.
rotated = millionsend.Webhooks.rotate(webhook.id, {"overlap_hours": 24})  # or {"signing_secret": "whsec_..."}
rotated.signing_secret
rotated.previous_secret_expires_at   # None once the old secret stops signing; also on get()
```

### API keys

```python
key = millionsend.ApiKeys.create({"name": "ci", "permission": "sending_access", "domain_id": domain.id})
key.token                            # shown once
millionsend.ApiKeys.list()
millionsend.ApiKeys.remove(key.id)
```

### Templates

Addressable by id or alias.

```python
template = millionsend.Templates.create({
    "name": "Welcome",
    "alias": "welcome-v1",           # optional, unique per team
    "subject": "Welcome aboard",     # optional
    "html": "<p>Hi {{{FIRST_NAME}}}</p>",
    "text": "Hi",                    # optional
})
millionsend.Templates.get("welcome-v1")
millionsend.Templates.list()
millionsend.Templates.update({"id": "welcome-v1", "subject": None, "alias": None})  # None clears
millionsend.Templates.duplicate(template.id)
millionsend.Templates.publish(template.id)   # templates are always published; kept for resend compatibility
millionsend.Templates.remove(template.id)
```

Resend's `from`, `reply_to` and `variables` are forwarded as given; the server answers 422 for them until templates model them.

### Usage (MillionSend extension)

```python
usage = millionsend.Usage.get()
usage.plan                     # None when self-hosted
usage.limits.emails_per_day    # None = unlimited
usage.today.emails_sent
```

### Deliverability (MillionSend extension)

Per-email best-practice insights and an account-level deliverability score — no Resend equivalent.

```python
insights = millionsend.Emails.get_insights(email.id)  # raises NotFoundError until computed
print(insights.score, insights.band)                  # 8.5 "excellent"
for check in insights.checks:
    print(check.id, check.status, check.penalty)

account = millionsend.Deliverability.get()            # trailing-30-day account score
print(account.score, account.band, account.guardrail_status)  # scores are None until enough data
```

## Migrating from Resend

```diff
- import resend
- resend.api_key = "re_123"
+ import millionsend
+ millionsend.api_key = "ms_123"
+ millionsend.base_url = "https://mail.acme.dev"  # self-hosted only

- resend.Emails.send({...})
+ millionsend.Emails.send({...})
```

Method names and payloads match. Notes:

- **Same resources**: `Emails`, `Batch`, `Contacts` (with `.Topics`, `.Segments`), `ContactProperties`, `Topics`, `Broadcasts`, `Suppressions` (with `.Batch`), `Domains`, `Webhooks`, `ApiKeys`, `Templates`. Payloads are sent verbatim, so a resend-python payload works as-is.
- **No audiences**: contacts are team-global, so there is no `Audiences` resource and no `audience_id` params. The API's `/audiences/...` routes are a compatibility shim for raw HTTP callers and are deliberately not exposed here. Resend's `Segments` is an alias of audiences; MillionSend's `Segments` is the distinct dynamic-filter feature.
- **MillionSend extensions** (no Resend equivalent): `Segments`, `Contacts.Batch`, `Contacts.list(segment_id=...)`, `Contacts.preferences_link`, `Webhooks.rotate`, `Usage`, `Deliverability`, `Emails.get_insights`.
- **Not available**: Resend's `ApiKeys.update`, `Webhooks` event history/replay/`verify`, `Emails.share` / `Emails.metrics` / receiving, `Broadcasts.recipients` / `clicked_links`, `Contacts.Segments.list`, `DomainClaims`, `ContactImports`, `Automations`, `Events`, `Logs`, `OAuthGrants`, and the `*_async` variants.
- MillionSend raises on API errors just like `resend`; the exception carries `.code` / `.status_code` / `.message`.

## License

MIT

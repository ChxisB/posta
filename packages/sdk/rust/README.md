# millionsend

Official Rust SDK for [MillionSend](https://github.com/MillionSend) — a
self-hostable, Resend-compatible email API on AWS SES.

The HTTP API is wire-compatible with Resend, and this crate mirrors the shape of
[`resend-rs`](https://crates.io/crates/resend-rs), so migrating is mostly a
find-and-replace: swap the crate and the client type (and, if you self-host,
point the base URL at your instance).

Async (`tokio` + `reqwest`). Every fallible call returns `Result<T, Error>`.

## Install

```toml
[dependencies]
millionsend = "0.8"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

## Quickstart

```rust
use millionsend::{MillionSend, SendEmailOptions};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let ms = MillionSend::new("ms_123"); // Cloud; self-hosted: with_base_url(key, origin)

    let sent = ms
        .emails
        .send(&SendEmailOptions {
            from: "Acme <onboarding@acme.dev>".into(),
            to: "success@simulator.amazonses.com".into(),
            subject: "Hello from MillionSend".into(),
            html: Some("<strong>It works!</strong>".into()),
            ..Default::default()
        })
        .await?;

    println!("sent {}", sent.id);
    Ok(())
}
```

`to`, `cc`, `bcc`, and `reply_to` accept a single address (`"a@b.dev".into()`) or
many (`vec!["a@b.dev", "c@d.dev"].into()`).

## Configuration

```rust
use millionsend::MillionSend;

// Key only: MillionSend Cloud (https://api.millionsend.com), unless
// MILLIONSEND_BASE_URL is set.
let ms = MillionSend::new("ms_123");

// Self-hosted: explicit base URL (wins over the environment).
let ms = MillionSend::with_base_url("ms_123", "https://mail.acme.dev");
assert_eq!(ms.base_url(), "https://mail.acme.dev");

// Both from the environment (MILLIONSEND_API_KEY + optional MILLIONSEND_BASE_URL).
let ms = MillionSend::from_env()?;

// Bring your own reqwest client (proxies, TLS, timeouts). The default has a
// 30s request timeout and a 10s connect timeout.
let ms = MillionSend::new("ms_123").with_client(reqwest::Client::new());

// Accept a non-loopback http:// base URL (refused by default).
let ms = MillionSend::with_base_url("ms_123", "http://10.0.0.5:3001").allow_insecure_http();
```

With no base URL the client talks to MillionSend Cloud, so the key alone is
enough; a self-hosted instance sets its origin with `with_base_url` or
`MILLIONSEND_BASE_URL`. Every request carries
`Authorization: Bearer <api_key>` and a `millionsend-rust/<version>` User-Agent.
Plain `http://` is only accepted for loopback hosts (`localhost`, `127.0.0.1`, `::1`);
any other `http://` URL makes every call return `Error::Api` named `insecure_base_url`,
since the API key is sent as a bearer header. Call `allow_insecure_http()` to talk to a
non-TLS instance elsewhere (e.g. inside a private network).

## Error handling

Fallible calls return `Result<T, millionsend::Error>`:

- `Error::Api(ApiError { status_code, name, message })` — a non-2xx response.
  `name` is a stable snake_case code you can match on (`validation_error`,
  `not_found`, `restricted_api_key`, `sending_paused`,
  `all_recipients_suppressed`, …).
- `Error::Http(_)` — a transport failure that never reached the API;
  `err.status_code()` is `None`.
- `Error::Parse(_)` — a 2xx body that failed to deserialize.

```rust
match ms.emails.get(&id).await {
    Ok(email) => println!("{}", email.last_event),
    Err(err) if err.name() == Some("not_found") => { /* … */ }
    Err(err) => eprintln!("{err}"),
}
```

## Resources

### Emails

```rust
use millionsend::{Attachment, IdempotentTrait, SendEmailOptions, Tag, UpdateEmailOptions};

let email = SendEmailOptions {
    from: "Acme <onboarding@acme.dev>".into(),
    to: vec!["ada@acme.dev", "bob@acme.dev"].into(),
    subject: "Invoice".into(),
    html: Some("<p>Attached.</p>".into()),
    reply_to: Some("billing@acme.dev".into()),
    tags: Some(vec![Tag { name: "kind".into(), value: "invoice".into() }]),
    topic_id: Some(topic.id.clone()),                      // skips opted-out recipients
    attachments: Some(vec![Attachment {
        filename: "invoice.pdf".into(),
        content: Some(base64_pdf),                          // base64
        content_type: Some("application/pdf".into()),
        ..Default::default()
    }]),
    headers: Some([("X-Entity-Ref-ID".to_string(), "42".to_string())].into()),
    ..Default::default()
};

ms.emails.send(&email).await?;                                    // POST /emails
ms.emails.send(email.with_idempotency_key("inv-42")).await?;      // + Idempotency-Key (Resend shape)
ms.emails.send_with_idempotency_key(&email, "inv-42").await?;     // same, explicit
ms.emails.get(&id).await?;                                        // GET /emails/:id
ms.emails.list(None).await?;                                      // GET /emails
ms.emails.update(&id, &UpdateEmailOptions {                       // PATCH /emails/:id
    scheduled_at: "2026-09-01T09:00:00Z".into(),
}).await?;
ms.emails.get_insights(&id).await?;                               // GET /emails/:id/insights
ms.emails.cancel(&id).await?;                                     // POST /emails/:id/cancel
ms.emails.delete(&id).await?;                                     // DELETE /emails/:id
```

Every field is put on the wire, including `template`, which the API currently
rejects with a 422 (send `html`/`text` instead). `send` and `batch.send` answer
422 `all_recipients_suppressed` when every `to` recipient is on the suppression
list or opted out of the send's `topic_id`. `get` includes a nullable
best-practice `score` (0–10); `get_insights` returns the full per-check report
behind it (404 `not_found` until insights exist).

#### Batch

```rust
use millionsend::{BatchValidation, IdempotentTrait};

let emails = vec![email_a, email_b];                       // 1–100
ms.batch.send(&emails).await?;                             // POST /emails/batch
ms.batch.send(emails.with_idempotency_key("batch-1")).await?;
ms.batch.send_with_idempotency_key(&emails, "batch-1").await?;

// x-batch-validation: permissive — invalid items land in `errors` instead of
// failing the whole call (strict is the server default).
let res = ms.batch.send_with_batch_validation(&emails, BatchValidation::Permissive).await?;
for err in &res.errors {
    eprintln!("email #{} rejected: {}", err.index, err.message);
}
```

### Contacts

Contacts are team-global — one record per email address (case-insensitive);
creating a duplicate is a 409 `validation_error`.

```rust
use millionsend::{
    ContactAddress, ContactInclude, ContactTopicUpdate, CreateContactOptions,
    DeleteContactOptions, ListContactsOptions, SegmentRef, TopicSubscription,
    UpdateContactOptions,
};

ms.contacts.create(&CreateContactOptions {
    email: "ada@acme.dev".into(),
    first_name: Some("Ada".into()),
    properties: Some([("plan".to_string(), "pro".into())].into()),
    segments: Some(vec![SegmentRef { id: segment.id.clone() }]),
    topics: Some(vec![ContactTopicUpdate {
        id: topic.id.clone(),
        subscription: TopicSubscription::OptIn,
    }]),
    ..Default::default()
}).await?;

// Address by id (a bare &str) or email; email wins if both are set.
ms.contacts.get("contact-id").await?;
ms.contacts.get(ContactAddress::email("ada@acme.dev")).await?;

// null clears a field, omitted leaves it unchanged.
ms.contacts.update("contact-id", &UpdateContactOptions {
    first_name: Some(None),        // clear
    unsubscribed: Some(true),      // set
    ..Default::default()
}).await?;

ms.contacts.delete(ContactAddress::email("ada@acme.dev"), None).await?; // the contact's emails stay in the send log
ms.contacts.delete("contact-id", Some(&DeleteContactOptions { erase: true })).await?; // ?erase=true — also scrubs the address from email history, event payloads and API logs (GDPR/LGPD)
ms.contacts.list(Some(&ListContactsOptions { limit: Some(20), ..Default::default() })).await?;
// Bulk read (MillionSend extension): attach properties and topic subscriptions to every item,
// so an audience reads in one request per 100 contacts instead of one per contact.
ms.contacts.list(Some(&ListContactsOptions {
    limit: Some(100),
    include: Some(vec![ContactInclude::Properties, ContactInclude::Topics]), // ?include=properties,topics
    ..Default::default()
})).await?;
```

`Contact.properties` values arrive as typed wrappers on the wire
(`{ "type": "string", "value": "pro" }` / `{ "type": "number", "value": 3 }`).
With `include`, each `ContactListItem` carries the same `properties` map and
the same `topics` rows as `contacts.get` / `contacts.topics.list`; without it
both are `None`. `segments.list_contacts` takes the same options.

#### Batch create, get and remove (MillionSend extensions)

```rust
use millionsend::{BatchContactsOptions, BatchRemoveContactsOptions, BatchValidation, DeleteContactOptions, OnConflict};

let res = ms.contacts.create_batch(&contacts, Some(&BatchContactsOptions {
    on_conflict: Some(OnConflict::Upsert),                 // error (default) | skip | upsert
    batch_validation: Some(BatchValidation::Permissive),
})).await?;                                                // POST /contacts/batch?on_conflict=upsert
println!("{} created, {} failed", res.counts.created, res.counts.failed);
for err in &res.errors { eprintln!("contacts.{}: {}", err.index, err.message); }
```

Up to 1000 contacts per call; each `data` entry carries the request `index`,
the contact `id` and a `status` (`created` | `updated` | `skipped`).

```rust
ms.contacts.batch_remove(&BatchRemoveContactsOptions::Ids(vec![id]), None).await?;              // POST /contacts/batch/remove
ms.contacts.batch_remove(&BatchRemoveContactsOptions::Emails(vec!["a@acme.dev".into()]), None).await?;
ms.contacts.batch_remove(&BatchRemoveContactsOptions::Ids(vec![id]), Some(&DeleteContactOptions { erase: true })).await?; // { "ids": [...], "erase": true }
```

Exactly one of ids or emails, up to 1000; `data` lists only the contacts
actually deleted (`{ object, contact, deleted }`), unknown ones are skipped.
Either way the contacts' emails stay in the send log; `erase: true` also scrubs
each address from email history, event payloads and API logs (a GDPR/LGPD
erasure). Needs MillionSend v0.6.54.

```rust
use millionsend::{BatchGetContactsOptions, ContactAddress, ContactInclude};

let res = ms.contacts.batch_get(
    &["contact-id".into(), ContactAddress::email("ada@acme.dev")],
    Some(&BatchGetContactsOptions { include: Some(vec![ContactInclude::Topics]) }),
).await?;                                                  // POST /contacts/batch/get
res.data;    // the contacts found, in request order, each with `topics` attached
res.missing; // [{ index, id?, email? }] — request entries that matched nobody
```

Up to 1000 addresses per call, ids and emails mixed (emails match
case-insensitively), and one request against the rate limit; unknown entries
land in `missing` instead of failing the call.

#### Topic subscriptions, segment membership and the preference page

```rust
use millionsend::{ContactTopicUpdate, TopicSubscription};

ms.contacts.topics.list("contact-id").await?;                   // GET   /contacts/:id/topics
ms.contacts.topics.update("contact-id", &[ContactTopicUpdate {
    id: "topic-id".into(),
    subscription: TopicSubscription::OptOut,
}]).await?;                                                     // PATCH /contacts/:id/topics

ms.contacts.segments.add("contact-id", &segment.id).await?;     // POST   /contacts/:id/segments/:segmentId
ms.contacts.segments.remove("contact-id", &segment.id).await?;  // DELETE /contacts/:id/segments/:segmentId

let link = ms.contacts.preferences_link(ContactAddress::email("ada@acme.dev")).await?;
println!("{}", link.url);                                       // POST /contacts/:idOrEmail/preferences-link
```

`topics.list` returns every topic of the team (one page) with the contact's
effective `subscription` — the explicit choice, else the topic default —
`explicit: false` when it is the default, and the topic's `visibility` (the
hosted preference page lists public topics only).

`preferences_link` (MillionSend extension) mints the contact's hosted
preference page — the page their emails' unsubscribe links open. The URL never
expires and lets its holder change that contact's preferences, so show it only
to the contact. 422 when the instance cannot build hosted links.

#### Contact properties

Typed definitions for the keys of `contact.properties`.

```rust
use millionsend::{ContactPropertyType, CreateContactPropertyOptions, UpdateContactPropertyOptions};
use serde_json::{json, Value};

let plan = ms.contacts.properties.create(&CreateContactPropertyOptions {
    key: "plan".into(),
    r#type: ContactPropertyType::String,
    fallback_value: Some(json!("free")),
}).await?;                                                 // POST /contact-properties
ms.contacts.properties.get(&plan.id).await?;
ms.contacts.properties.list(None).await?;
ms.contacts.properties.update(&plan.id, &UpdateContactPropertyOptions {
    fallback_value: Some(Value::Null),                     // null clears the fallback
}).await?;
ms.contacts.properties.delete(&plan.id).await?;
```

### Topics

```rust
use millionsend::{CreateTopicOptions, TopicSubscription, TopicVisibility, UpdateTopicOptions};

let mut topic = CreateTopicOptions::new("Product updates", TopicSubscription::OptIn);
topic.visibility = Some(TopicVisibility::Public);
ms.topics.create(&topic).await?;
ms.topics.get(&id).await?;
ms.topics.list().await?;
ms.topics.update(&id, &UpdateTopicOptions { name: Some("News".into()), ..Default::default() }).await?;
ms.topics.delete(&id).await?;
```

### Broadcasts

Target a segment (`segment_id`) and/or a topic's subscribers (`topic_id`);
with neither set, the broadcast goes to every contact.

```rust
use millionsend::{CreateBroadcastOptions, UpdateBroadcastOptions};

let broadcast = ms.broadcasts.create(&CreateBroadcastOptions {
    name: Some("Launch".into()),
    segment_id: Some(segment.id.clone()),
    from: "Acme <news@acme.dev>".into(),
    subject: "Launch".into(),
    html: Some("<p>Hi {{{FIRST_NAME|there}}}</p>".into()),
    preview_text: Some("It's here".into()),
    topic_id: Some(topic.id.clone()),
    send: Some(true),                                      // send now instead of saving a draft
    scheduled_at: Some("in 1 hour".into()),                // with send: true — schedule instead
    ..Default::default()
}).await?;

ms.broadcasts.list(None).await?;
ms.broadcasts.get(&broadcast.id).await?;
ms.broadcasts.update(&broadcast.id, &UpdateBroadcastOptions {
    subject: Some("Launch 🚀".into()),
    clear_topic_id: true,                                  // sends "topic_id": null (detach)
    ..Default::default()
}).await?;                                                 // draft only
ms.broadcasts.send(&broadcast.id, Some("2026-09-01T09:00:00Z")).await?;  // None = send now
ms.broadcasts.cancel(&broadcast.id).await?;                // scheduled only
ms.broadcasts.delete(&broadcast.id).await?;                // draft only
```

### Segments (MillionSend extension)

A segment is either a saved filter over the team's contacts or, with no
filter, a manual list fed by `contacts.segments.add`. `Segment.filter` is
`None` for manual segments.

```rust
use millionsend::{
    CreateSegmentOptions, SegmentCondition, SegmentFilter, SegmentMatch, UpdateSegmentOptions,
};

let segment = ms.segments.create(&CreateSegmentOptions {
    name: "Pro plan".into(),
    filter: Some(SegmentFilter {
        match_: SegmentMatch::All,
        conditions: vec![SegmentCondition {
            field: "property:plan".into(),
            op: "equals".into(),
            value: Some("pro".into()),
        }],
    }),
}).await?;
let vips = ms.segments.create(&CreateSegmentOptions {
    name: "VIPs".into(),
    filter: None,                            // manual segment: members come from contacts.segments.add
}).await?;

ms.segments.get(&id).await?;                 // includes a live contact_count
ms.segments.list(None).await?;
ms.segments.list_contacts(&id, None).await?; // GET /segments/:id/contacts — takes ListContactsOptions (include works here too)
ms.segments.update(&id, &UpdateSegmentOptions {
    filter: Some(None),                      // null drops the filter, keeping the members added by hand
    ..Default::default()
}).await?;
ms.segments.delete(&id).await?;
```

### Suppressions

Addresses the team never sends to. Entries are addressable by id or email.

```rust
use millionsend::{
    AddSuppressionOptions, BatchAddSuppressionOptions, BatchRemoveSuppressionOptions,
    ListSuppressionsOptions, SuppressionOrigin,
};

ms.suppressions.add(&AddSuppressionOptions::new("bounced@example.com")).await?;   // POST /suppressions
ms.suppressions.get("bounced@example.com").await?;                                // GET /suppressions/:idOrEmail
ms.suppressions.list(Some(&ListSuppressionsOptions {
    origin: Some(SuppressionOrigin::Complaint),                                    // bounce | complaint | manual | unsubscribe
    ..Default::default()
})).await?;
ms.suppressions.remove("bounced@example.com").await?;                             // DELETE /suppressions/:idOrEmail

ms.suppressions.batch_add(&BatchAddSuppressionOptions {
    emails: vec!["a@example.com".into(), "b@example.com".into()],                 // up to 1000
    origin: Some(SuppressionOrigin::Manual),
}).await?;
ms.suppressions.batch_remove(&BatchRemoveSuppressionOptions::Emails(vec!["a@example.com".into()])).await?;
ms.suppressions.batch_remove(&BatchRemoveSuppressionOptions::Ids(vec![id])).await?;
```

### Domains

```rust
use millionsend::{CreateDomainOptions, UpdateDomainOptions};

let domain = ms.domains.create(&CreateDomainOptions {
    name: "acme.dev".into(),
    open_tracking: Some(true),
    click_tracking: Some(true),
    tracking_subdomain: Some("links".into()),              // links.acme.dev
    ..Default::default()                                   // region/custom_return_path: deployment defaults
}).await?;
for record in &domain.records {
    println!("{} {} {}", record.r#type, record.name, record.value);
}

ms.domains.list(None).await?;                              // items carry no records
ms.domains.get(&domain.id).await?;
ms.domains.verify(&domain.id).await?;                      // POST /domains/:id/verify
ms.domains.update(&domain.id, &UpdateDomainOptions {
    click_tracking: Some(false),
    tracking_subdomain: Some(None),                        // null clears the branded host
    ..Default::default()
}).await?;
ms.domains.delete(&domain.id).await?;
```

### Webhooks

```rust
use millionsend::{CreateWebhookOptions, RotateWebhookOptions, UpdateWebhookOptions, WebhookStatus};

let hook = ms.webhooks.create(&CreateWebhookOptions {
    endpoint: "https://acme.dev/hooks/millionsend".into(),
    events: vec!["email.delivered".into(), "email.bounced".into(), "deliverability.paused".into()],
    signing_secret: None,                                  // minted; or pass your own whsec_…
}).await?;
println!("verify payloads with {}", hook.signing_secret);

ms.webhooks.list(None).await?;
ms.webhooks.get(&hook.id).await?;                          // includes signing_secret, previous_secret_expires_at
ms.webhooks.update(&hook.id, &UpdateWebhookOptions {
    status: Some(WebhookStatus::Disabled),
    ..Default::default()
}).await?;

let rotated = ms.webhooks.rotate(&hook.id, None).await?;   // POST /webhooks/:id/rotate with {}
println!("switch to {} before {:?}", rotated.signing_secret, rotated.previous_secret_expires_at);
ms.webhooks.rotate(&hook.id, Some(&RotateWebhookOptions {
    signing_secret: Some("whsec_…".into()),                // bring your own
    overlap_hours: Some(0),                                // 0–72, default 24; 0 drops the old secret at once
})).await?;
ms.webhooks.delete(&hook.id).await?;
```

`rotate` (MillionSend extension) mints or takes a new signing secret; until
`previous_secret_expires_at` every delivery carries both signatures, so the
receiver can switch at any point in the window. Subscribable event names
include `email.*`, `deliverability.*`, `contact.created`/`updated`/`deleted`/
`unsubscribed`/`resubscribed`/`topic_opt_in`/`topic_opt_out` and
`suppression.added`/`removed`.

### API keys

```rust
use millionsend::{ApiKeyPermission, CreateApiKeyOptions};

let key = ms.api_keys.create(&CreateApiKeyOptions {
    name: "ci".into(),
    permission: Some(ApiKeyPermission::SendingAccess),     // default full_access
    domain_id: Some(domain.id.clone()),                    // restrict sending to one domain
}).await?;
println!("{}", key.token);                                 // shown once
ms.api_keys.list(None).await?;
ms.api_keys.delete(&key.id).await?;
```

### Templates

Addressable by id or alias.

```rust
use millionsend::{CreateTemplateOptions, UpdateTemplateOptions};

let mut welcome = CreateTemplateOptions::new("Welcome", "<p>Hi {{{FIRST_NAME|there}}}</p>");
welcome.subject = Some("Welcome!".into());
welcome.alias = Some("welcome".into());
let created = ms.templates.create(&welcome).await?;

ms.templates.get("welcome").await?;
ms.templates.list(None).await?;
ms.templates.update("welcome", &UpdateTemplateOptions {
    subject: Some(Some("Hello".into())),                   // set
    alias: Some(None),                                     // null clears
    ..Default::default()
}).await?;
ms.templates.publish(&created.id).await?;                  // no-op kept for Resend compatibility
ms.templates.duplicate(&created.id).await?;
ms.templates.delete(&created.id).await?;
```

`from`, `reply_to` and `variables` are passed through; the API currently
answers 422 when they are set.

### Deliverability (MillionSend extension)

Account-level score over the trailing 30 days; scores are `None` until there is
enough data.

```rust
let report = ms.deliverability.get().await?;   // GET /deliverability
if let Some(score) = report.score {
    println!("{score} ({})", report.band.as_deref().unwrap_or("-"));
}
```

### Usage (MillionSend extension)

```rust
let usage = ms.usage.get().await?;             // GET /usage
println!("{} sent today, resets {}", usage.today.emails_sent, usage.today.resets_at);
if let Some(cap) = usage.limits.emails_per_day {
    println!("plan {:?} caps at {cap}/day", usage.plan);
}
```

## Migrating from Resend

```diff
- use resend_rs::{Resend, types::CreateEmailBaseOptions};
- let resend = Resend::new("re_123");
+ use millionsend::{MillionSend, SendEmailOptions};
+ let ms = MillionSend::new("ms_123"); // self-hosted: with_base_url("ms_123", "https://mail.acme.dev")
```

Resource and method names match: `emails`, `batch`, `contacts`, `topics`,
`broadcasts`, `segments`, `suppressions`, `domains`, `webhooks`, `api_keys`,
`templates`. Notes:

- **Contacts nest** their sub-resources — `contacts.topics.list`/`update`,
  `contacts.segments.add`/`remove`, `contacts.properties.*` — where `resend-rs`
  keeps them flat (`get_contact_topics`, `update_contact_topics`,
  `add_contact_segment`, `create_property`, …).

- **No audiences.** Contacts are team-global; the API's `/audiences/*` routes
  are a compatibility shim and are not part of this SDK. Use `segments` (saved
  filters or manual lists) to target a subset, or a broadcast with no
  `segment_id`/`topic_id` to reach everyone.
- **MillionSend extensions** with no Resend counterpart: `segments`,
  `contacts.create_batch`, `contacts.batch_get`, `contacts.batch_remove`,
  `contacts.preferences_link`,
  `webhooks.rotate`, `deliverability`, `usage`, `emails.get_insights`.
- **Templates** are always published; `publish` is a no-op kept for
  compatibility, and `from`/`reply_to`/`variables` are rejected with 422.
- **Nullable clears**: `Option<Option<T>>` fields (`Some(None)`) send JSON
  `null`; `UpdateBroadcastOptions::clear_topic_id` does the same for
  `topic_id`.

## License

MIT

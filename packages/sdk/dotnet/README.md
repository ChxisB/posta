# MillionSend .NET SDK

Official .NET SDK for [MillionSend](https://github.com/MillionSend/millionsend) — a
self-hostable, [Resend](https://resend.com)-wire-compatible email API.

The API is wire-compatible with Resend, so migrating is mostly swapping the
package. MillionSend Cloud works with just an API key; a self-hosted instance
sets its origin. Targets **net8.0**.

## Install

```bash
dotnet add package MillionSend
```

## Quickstart

```csharp
using MillionSend;

var client = new MillionSendClient("ms_123");                             // MillionSend Cloud
// var client = new MillionSendClient("ms_123", "https://mail.acme.dev");   // self-hosted

var res = await client.EmailSendAsync(new EmailMessage
{
    From = "Acme <onboarding@acme.dev>",
    To = "success@simulator.amazonses.com",
    Subject = "Hello from MillionSend",
    Html = "<strong>It works!</strong>",
});

if (res.Success)
    Console.WriteLine($"sent {res.Content!.Id}");
else
    Console.Error.WriteLine($"{res.Exception!.ErrorName}: {res.Exception.Message}");
```

`To`, `Cc`, `Bcc`, and `ReplyTo` accept a single address or an array — assign a
`string` or a `string[]` directly.

## Configuration

Construct with the convenience constructor, or with `MillionSendClientOptions`:

```csharp
var client = new MillionSendClient(new MillionSendClientOptions
{
    ApiToken = "ms_123",
    ApiUrl = "https://mail.acme.dev",
});
```

- `ApiToken` falls back to the `MILLIONSEND_API_KEY` environment variable. Missing
  key → throws at construction.
- `ApiUrl` falls back to `MILLIONSEND_BASE_URL`, then `https://api.millionsend.com`
  (MillionSend Cloud). **Self-hosting? Set this to your deployment's origin.**
- Plain `http://` is only accepted for loopback hosts (`localhost`, `127.0.0.1`, `::1`);
  any other `http://` URL throws `ArgumentException` at construction, since the API key
  is sent as a bearer header. Set `AllowInsecureHttp = true` on the options to talk to a
  non-TLS instance elsewhere (e.g. inside a private network).

You may pass your own `HttpClient` as the second argument (for proxies, custom
handlers, or tests): `new MillionSendClient(options, httpClient)`.

## Error handling

No method throws for an API or transport error. Every call returns a
`MillionSendResponse<T>`:

- `Success` — `true` when the call succeeded.
- `Content` — the deserialized response body on success.
- `Exception` — a `MillionSendException` on failure, carrying `StatusCode`
  (`int?`), `ErrorName` (the stable snake_case discriminant, e.g.
  `validation_error`, `not_found`, `sending_paused`, `all_recipients_suppressed`),
  and `Message`.

`EmailSendAsync` and `EmailBatchAsync` answer 422 `all_recipients_suppressed` when
every `To` recipient is on the suppression list or opted out of the send's `TopicId`.

Transport and client-side failures (the request never reached the API) carry
`StatusCode == null` and `ErrorName == "application_error"`.

```csharp
var res = await client.EmailRetrieveAsync(id);
if (!res.Success && res.Exception!.ErrorName == "not_found")
{
    // ...
}
```

## Clearing a field on update (`Optional<T>`)

PATCH bodies distinguish "leave unchanged" (key omitted) from "clear" (JSON
`null`). Fields that the API lets you clear are typed `Optional<T>?`: assign a
plain value as usual, leave it unset (or assign C# `null`) to keep the current
value, or assign `Optional<T>.Null` to send an explicit `null`.

```csharp
await client.ContactUpdateAsync(new ContactUpdateOptions
{
    Id = contactId,
    FirstName = "Ada",                  // sets
    LastName = Optional<string>.Null,   // clears
});
await client.BroadcastUpdateAsync(id, new BroadcastUpdateOptions { TopicId = Optional<Guid?>.Null });
```

Available on contact `FirstName`/`LastName`, broadcast `TopicId`, template
`Subject`/`Text`/`Alias`, domain `TrackingSubdomain`, and contact-property
`FallbackValue`. A `null` value inside `Properties` clears that key.

## Resources

### Emails

```csharp
await client.EmailSendAsync(message, idempotencyKey: "unique-key"); // POST /emails
await client.EmailSendAsync("unique-key", message);                 // same, resend-dotnet argument order
await client.EmailRetrieveAsync(id);                                // GET /emails/{id}
await client.EmailListAsync(new ListOptions { Limit = 50 });        // GET /emails
await client.EmailRescheduleAsync(id, "2026-09-01T09:00:00Z");      // PATCH /emails/{id}
await client.EmailCancelAsync(id);                                  // POST /emails/{id}/cancel (scheduled only)
await client.EmailDeleteAsync(id);                                  // DELETE /emails/{id}
await client.EmailInsightsRetrieveAsync(id);                        // GET /emails/{id}/insights
```

`EmailMessage` carries every wire field: `From`, `To`, `Subject`, `Html`, `Text`,
`Cc`, `Bcc`, `ReplyTo`, `ScheduledAt`, `Tags`, `TopicId`, `Attachments`
(`Filename`, base64 `Content`, `ContentType`, `ContentId`, `Path`), `Headers`, and
`Template` (passed through; the server answers 422 until template sending ships).

Batches take up to 100 messages. `BatchValidationMode.Permissive` sends the
`x-batch-validation` header so valid items go out and invalid ones come back in
`Errors` (the default, `Strict`, rejects the whole batch):

```csharp
var res = await client.EmailBatchAsync(new[] { a, b }, BatchValidationMode.Permissive, idempotencyKey: "k");
foreach (var err in res.Content!.Errors ?? new())
    Console.WriteLine($"item {err.Index}: {err.Message}");
```

`EmailSendAsync` and `EmailBatchAsync` are the only endpoints that accept the
`Idempotency-Key` header.

`EmailRetrieveAsync` includes a `Score` (0–10 best-practice score, `null` when
the email has no insights). `EmailInsightsRetrieveAsync` returns the full
pre-send report — score, band, and per-check results — or a `not_found` error
when insights are not available for the email.

### Contacts

Contacts are team-global: one record per email address (case-insensitive), no
audiences. Creating a duplicate returns a 409 `validation_error`.

```csharp
await client.ContactAddAsync(new ContactCreateOptions
{
    Email = "ada@acme.dev",
    FirstName = "Ada",
    Properties = new() { ["plan"] = "pro" },
    Segments = new() { new SegmentRef { Id = segmentId } },
    Topics = new() { new ContactTopicUpdate { Id = topicId, Subscription = TopicSubscription.OptIn } },
});
await client.ContactRetrieveAsync(new ContactAddress { Email = "ada@acme.dev" });
await client.ContactRetrieveAsync(new ContactAddress { Id = contactId });   // by id or email (email wins)
await client.ContactUpdateAsync(new ContactUpdateOptions { Id = contactId, Unsubscribed = true });
await client.ContactDeleteAsync(new ContactAddress { Email = "ada@acme.dev" });   // their emails stay in the log
// Erase (MillionSend extension): also scrub the address from email history, event
// payloads and API logs — a GDPR/LGPD erasure                                   // ?erase=true
await client.ContactDeleteAsync(new ContactAddress { Email = "ada@acme.dev" }, new ContactDeleteOptions { Erase = true });
await client.ContactListAsync(new ListOptions { Limit = 50 });
// Bulk read (MillionSend extension): attach Properties and Topics to every row, so an
// audience reads in one request per 100 contacts instead of one per contact   // ?include=properties,topics
await client.ContactListAsync(new ContactListOptions { Limit = 100, Include = new() { ContactInclude.Properties, ContactInclude.Topics } });

// Topic subscriptions (granular unsubscribe)
await client.ContactTopicsUpdateAsync(new ContactTopicsUpdateOptions
{
    Email = "ada@acme.dev",
    Topics = new() { new ContactTopicUpdate { Id = topicId, Subscription = TopicSubscription.OptOut } },
});
// Every topic with the contact's effective subscription: their explicit choice,
// else the topic default (Explicit == false)                                 // GET /contacts/{id}/topics
var topics = await client.ContactListTopicsAsync(new ContactAddress { Email = "ada@acme.dev" });
foreach (var t in topics.Content!.Data)
    Console.WriteLine($"{t.Name}: {t.Subscription}{(t.Explicit ? "" : " (default)")}");

// Segment membership
await client.ContactAddToSegmentAsync(new ContactAddress { Id = contactId }, segmentId);      // POST /contacts/{id}/segments/{segmentId}
await client.ContactRemoveFromSegmentAsync(new ContactAddress { Id = contactId }, segmentId); // DELETE …

// Bulk import (MillionSend extension): up to 1000 items per call
var batch = await client.ContactBatchAsync(contacts, new ContactBatchOptions
{
    OnConflict = ContactBatchOnConflict.Upsert,       // ?on_conflict=error|skip|upsert
    Validation = BatchValidationMode.Permissive,      // x-batch-validation header
});
Console.WriteLine($"{batch.Content!.Counts.Created} created, {batch.Content.Counts.Failed} failed");

// Bulk lookup (MillionSend extension): up to 1000 contacts by id or email in one request,
// in request order; unknown entries are listed, not errors — one request against the rate limit
var found = await client.ContactBatchGetAsync(                                 // POST /contacts/batch/get
    new[] { new ContactAddress { Id = contactId }, new ContactAddress { Email = "b@acme.dev" } },
    new ContactBatchGetOptions { Include = new() { ContactInclude.Topics } });
found.Content!.Data;      // the contacts found: Id, Email, …, plus Properties/Topics per Include
found.Content.Missing;    // [{ Index, Id?, Email? }] — request entries that matched nobody

// Bulk delete (MillionSend extension): up to 1000 per call, by emails or by ids;
// the response lists only the rows actually deleted. Their emails stay in the log;
// Erase also scrubs each address, as on a single delete          // POST /contacts/batch/remove
await client.ContactBatchRemoveAsync(new[] { "a@acme.dev", "b@acme.dev" });
await client.ContactBatchRemoveAsync(new[] { id1, id2 }, new ContactDeleteOptions { Erase = true });

// Preference-center link (MillionSend extension): the contact's hosted preferences
// page, the same one their unsubscribe links open. No expiry — hand it only to the
// contact. 422 when the instance cannot build hosted links.   // POST /contacts/{id}/preferences-link
var link = await client.ContactPreferencesLinkAsync(new ContactAddress { Email = "ada@acme.dev" });
Console.WriteLine(link.Content!.Url);
```

A contact is addressable by id **or** email; when both are set, email wins.
`ContactListTopicsAsync` items carry the topic's `Visibility`; the hosted preference
page lists public topics only.

### Contact properties

```csharp
await client.ContactPropCreateAsync(new ContactPropertyCreateOptions
{
    Key = "plan", Type = ContactPropertyType.String, FallbackValue = "free",
});
await client.ContactPropListAsync();
await client.ContactPropRetrieveAsync(id);
await client.ContactPropUpdateAsync(id, new ContactPropertyUpdateOptions { FallbackValue = "trial" });
await client.ContactPropDeleteAsync(id);
```

### Topics

```csharp
await client.TopicAddAsync(new TopicCreateOptions
{
    Name = "Product updates",
    DefaultSubscription = TopicSubscription.OptIn,
    Visibility = TopicVisibility.Public,   // always shown on the unsubscribe page; default Private
});
await client.TopicRetrieveAsync(id);
await client.TopicListAsync();     // unpaginated: bare { data }
await client.TopicUpdateAsync(id, new TopicUpdateOptions { Name = "Product news" });
await client.TopicDeleteAsync(id);
```

### Broadcasts

Targeting is an optional `SegmentId` and/or `TopicId` — set neither to send to
every contact of the team.

```csharp
var broadcast = await client.BroadcastAddAsync(new BroadcastCreateOptions
{
    From = "Acme <news@acme.dev>",
    Subject = "Launch",
    Html = "<p>Hi {{{FIRST_NAME|there}}}</p>",
    PreviewText = "It's here",
    SegmentId = segmentId,               // optional
    Send = true,                          // send now instead of saving a draft
    ScheduledAt = "2026-09-01T09:00:00Z", // requires Send = true
});
await client.BroadcastListAsync();
await client.BroadcastRetrieveAsync(id);
await client.BroadcastUpdateAsync(id, new BroadcastUpdateOptions { Subject = "Launch 🚀" }); // draft only
await client.BroadcastSendAsync(id, scheduledAt: "2026-09-01T09:00:00Z"); // omit to send now
await client.BroadcastCancelAsync(id); // scheduled only
await client.BroadcastDeleteAsync(id); // draft only
```

### Segments (MillionSend extension)

Dynamic segments are a saved filter over the team's contacts — a MillionSend
superset with no Resend equivalent.

```csharp
await client.SegmentAddAsync(new SegmentCreateOptions
{
    Name = "Pro plan",
    Filter = new SegmentFilter
    {
        Match = SegmentMatch.All,
        Conditions = new() { new SegmentCondition { Field = "property:plan", Op = "equals", Value = "pro" } },
    },
});
await client.SegmentRetrieveAsync(id);   // includes a live contact_count
await client.SegmentListAsync();
await client.SegmentUpdateAsync(id, new SegmentUpdateOptions { Name = "Pro tier" });
await client.SegmentContactListAsync(id, new ListOptions { Limit = 100 }); // GET /segments/{id}/contacts
await client.SegmentContactListAsync(id, new ContactListOptions { Include = new() { ContactInclude.Properties } }); // ?include=properties
await client.SegmentDeleteAsync(id);
```

### Suppressions

```csharp
await client.SuppressionAddAsync("bounced@acme.dev", SuppressionOrigin.Manual);
await client.SuppressionListAsync(new SuppressionListOptions { Limit = 50, Origin = SuppressionOrigin.Bounce });
await client.SuppressionRetrieveAsync("bounced@acme.dev");   // by id or email
await client.SuppressionRemoveAsync(id.ToString());
await client.SuppressionBatchAddAsync(new[] { "a@acme.dev", "b@acme.dev" }, SuppressionOrigin.Unsubscribe);
await client.SuppressionBatchRemoveAsync(new[] { "a@acme.dev" });   // by emails…
await client.SuppressionBatchRemoveAsync(new[] { id1, id2 });        // …or by ids
```

### Domains

```csharp
var domain = await client.DomainAddAsync(new DomainCreateOptions
{
    Name = "acme.dev",
    Region = "us-east-1",        // optional
    CustomReturnPath = "send",   // optional
    OpenTracking = true, ClickTracking = true, TrackingSubdomain = "track",
});
foreach (var r in domain.Content!.Records!)
    Console.WriteLine($"{r.Type} {r.Name} {r.Value}");   // DNS records to publish

await client.DomainListAsync();
await client.DomainRetrieveAsync(id);
await client.DomainVerifyAsync(id);
await client.DomainUpdateAsync(id, new DomainUpdateOptions { ClickTracking = false });
await client.DomainDeleteAsync(id);
```

### Webhooks

```csharp
var hook = await client.WebhookCreateAsync(new WebhookCreateOptions
{
    Endpoint = "https://acme.dev/hooks/millionsend",
    Events = new() { "email.delivered", "email.bounced", "email.complained" },
});
Console.WriteLine(hook.Content!.SigningSecret);   // also returned by WebhookRetrieveAsync

await client.WebhookListAsync();
await client.WebhookRetrieveAsync(id);
await client.WebhookUpdateAsync(id, new WebhookUpdateOptions { Status = WebhookStatus.Disabled });
await client.WebhookDeleteAsync(id);

// Rotate the signing secret (MillionSend extension). For OverlapHours (0–72) every
// delivery is signed with both secrets, so the receiver switches without a gap.
var rotated = await client.WebhookRotateAsync(id, new WebhookRotateOptions { OverlapHours = 24 }); // POST /webhooks/{id}/rotate
Console.WriteLine($"{rotated.Content!.SigningSecret} (old one signs until {rotated.Content.PreviousSecretExpiresAt})");
await client.WebhookRotateAsync(id);   // mint a secret with the server's default overlap
```

`WebhookRetrieveAsync` also reports `PreviousSecretExpiresAt` while a rotation's
overlap window is open. Subscribable events are the `email.*` set plus
`deliverability.*`, `quota.*`, `contact.created|updated|deleted|unsubscribed|resubscribed|topic_opt_in|topic_opt_out`
and `suppression.added|removed`.

### API keys

```csharp
var key = await client.ApiKeyCreateAsync("ci", ApiKeyPermission.SendingAccess, domainId);
Console.WriteLine(key.Content!.Token);   // shown once
await client.ApiKeyListAsync();
await client.ApiKeyDeleteAsync(key.Content.Id);
```

### Templates

Addressed by id **or** alias. MillionSend templates have no draft/publish cycle:
`TemplatePublishAsync` is a no-op kept for resend-dotnet compatibility.

```csharp
await client.TemplateCreateAsync(new TemplateCreateOptions
{
    Name = "Welcome", Alias = "welcome", Subject = "Hi {{{FIRST_NAME}}}", Html = "<p>…</p>",
});
await client.TemplateListAsync();
await client.TemplateRetrieveAsync("welcome");
await client.TemplateUpdateAsync("welcome", new TemplateUpdateOptions { Subject = "Welcome!" });
await client.TemplateDuplicateAsync("welcome");
await client.TemplatePublishAsync("welcome");
await client.TemplateDeleteAsync("welcome");
```

### Usage (MillionSend extension)

```csharp
var usage = await client.UsageRetrieveAsync();   // GET /usage
Console.WriteLine($"{usage.Content!.Today.EmailsSent}/{usage.Content.Limits.EmailsPerDay} today");
```

### Deliverability (MillionSend extension)

The account-level deliverability score over the trailing window. Scores are
0–10; `Score`/`Band` are `null` when there is not enough data yet.

```csharp
var res = await client.DeliverabilityRetrieveAsync(); // GET /deliverability
if (res.Success)
    Console.WriteLine($"{res.Content!.Score} ({res.Content.Band}), guardrail: {res.Content.GuardrailStatus}");
```

## Migrating from Resend

The `resend-dotnet` SDK exposes resources as `client.Emails.SendAsync(...)` and
throws `ResendException`. MillionSend flattens the surface to
`client.EmailSendAsync(...)` and returns a `MillionSendResponse<T>` (no throw).
Method names and payload shapes otherwise line up. Notes:

- **Idempotency**: both argument orders work — `EmailSendAsync(message, idempotencyKey: k)`
  and resend-dotnet's `EmailSendAsync(k, message)`; same for `EmailBatchAsync`.
- **Batch validation**: `BatchValidationMode` is resend-dotnet's
  `EmailBatchValidationMode`; it also drives `ContactBatchAsync`.
- **Contact addressing**: methods that take a contact (`ContactRetrieveAsync`,
  `ContactListTopicsAsync`, …) accept a `ContactAddress` with an id **or** an email
  where resend-dotnet takes a `Guid`.
- **No audiences**: contacts are team-global, one record per email address.
  The `/audiences/*` routes on the API are a compatibility shim and are not part
  of this SDK; Resend's audience grouping maps to MillionSend's dynamic
  **segments** (saved filters) above.
- **Templates** exist but template-based *sending* does not yet: `EmailMessage.Template`
  is put on the wire and the server answers 422.
- **MillionSend extensions** (no Resend counterpart): segments, contact batch import,
  batch get and batch remove, `include=` on contact lists, `erase` on contact deletes,
  contact preference links, webhook secret rotation, usage, email insights, deliverability.

## Development

```bash
dotnet test          # unit tests (the e2e tests stay inert without MILLIONSEND_E2E)
```

The e2e tests run only when `MILLIONSEND_E2E=1` opts in (plus the API key):

```bash
MILLIONSEND_E2E=1 MILLIONSEND_API_KEY=ms_... dotnet test --filter Category=e2e
```

## License

MIT

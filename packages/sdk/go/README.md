# posta-go

Official Go client for [Posta](https://github.com/ChxisB/posta): a
self-hostable, Resend-compatible email API on AWS SES.

The API is wire-compatible with Resend, and this SDK mirrors the shape of
[`resend-go`](https://github.com/resend/resend-go), so migrating is mostly a
find-and-replace: swap the import and constructor. Posta Cloud works with
just the API key; a self-hosted instance also sets `BaseURL`.

## Install

```bash
go get github.com/ChxisB/posta/packages/sdk/go
```

Requires Go 1.21+.

## Quickstart

```go
package main

import (
	"fmt"
	"log"

	posta "github.com/ChxisB/posta/packages/sdk/go"
)

func main() {
	client := posta.NewClient("po_123")
	// client.BaseURL = "https://mail.acme.dev" // self-hosted instances only

	sent, err := client.Emails.Send(&posta.SendEmailRequest{
		From:    "Acme <onboarding@acme.dev>",
		To:      []string{"success@simulator.amazonses.com"},
		Subject: "Hello from Posta",
		Html:    "<strong>It works!</strong>",
	})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println("sent", sent.Id)
}
```

## Configuration

```go
client := posta.NewClient(apiKey)
client.BaseURL = "https://mail.acme.dev"        // self-hosted instance
client.HTTPClient = &http.Client{Timeout: time.Minute} // bring your own transport
client.UserAgent = "myapp/1.0 " + client.UserAgent      // extend the User-Agent
client.AllowInsecureHTTP = true                          // accept a non-loopback http:// BaseURL
```

- `apiKey` falls back to `POSTA_API_KEY` when empty.
- `BaseURL` falls back to `POSTA_BASE_URL`, then `https://api.posta.example`
  (Posta Cloud). A self-hosted instance sets its own origin.
- Plain `http://` is only accepted for loopback hosts (`localhost`, `127.0.0.1`, `::1`);
  any other `http://` URL makes every call return an `application_error`, since the API
  key is sent as a bearer header. Set `AllowInsecureHTTP = true` to talk to a non-TLS
  instance elsewhere (e.g. inside a private network).

Every method has a non-context form. The transactional hot path: every
`Emails.*` method, `Batch.Send`, `Contacts.Batch.*`,
`Suppressions.Batch.*`, `Deliverability.Get` and `Usage.Get`, also exposes a
`…WithContext(ctx, …)` variant.

## Errors

Methods return `(*T, error)`. On any non-2xx response the error is a
`*PostaError`:

```go
sent, err := client.Emails.Get(id)
if err != nil {
	var apiErr *posta.PostaError
	if errors.As(err, &apiErr) {
		switch apiErr.Name { // stable, switchable code
		case "not_found":
			// …
		case "validation_error":
			// …
		case "all_recipients_suppressed":
			// nothing was sent: see below
		}
		log.Printf("status=%d name=%s: %s", apiErr.StatusCode, apiErr.Name, apiErr.Message)
	}
}
```

`StatusCode` is `0` when the request never reached the API (a transport or
client-side failure): the wire's `statusCode: null`.

`Emails.Send` and `Batch.Send` answer `422 all_recipients_suppressed` when every
`To` recipient is on the suppression list or opted out of the send's `TopicId`;
nothing is sent.

## Request options

`Emails.Send`, `Batch.Send`, `Contacts.Batch.Create`, `Contacts.Batch.Get`,
`Contacts.List`, `Segments.ListContacts` and `Contacts.Remove` take functional
options:

```go
client.Emails.Send(req, posta.WithIdempotencyKey("order-42"))
client.Batch.Send(reqs,
	posta.WithIdempotencyKey("run-7"),
	posta.WithBatchValidation(posta.BatchValidationPermissive), // x-batch-validation header
)
client.Contacts.Batch.Create(contacts, posta.WithOnConflict(posta.OnConflictUpsert))
client.Contacts.List(nil, posta.WithInclude(posta.ContactIncludeTopics)) // ?include=topics
client.Contacts.Remove(addr, posta.WithErase())                                // ?erase=true
```

resend-go's option structs work too:

```go
client.Emails.SendWithOptions(ctx, req, &posta.SendEmailOptions{IdempotencyKey: "order-42"})
client.Batch.SendWithOptions(ctx, reqs, &posta.BatchSendEmailOptions{
	IdempotencyKey:  "run-7",
	BatchValidation: posta.BatchValidationPermissive,
})
```

Batch validation is `strict` by default (any invalid item rejects the whole
batch). `permissive` sends the valid items and lists the rest in the
response's `Errors []BatchError{Index, Message}`.

## Clearing a value with `null`

Update requests use `omitempty`, so an empty field is simply left unchanged.
Where the API accepts an explicit `null` to erase a stored value, the request
has a `Clear…` method that puts that `null` on the wire:

```go
req := &posta.UpdateContactRequest{Id: contactID, FirstName: posta.Ptr("Ada")}
req.ClearLastName() // {"first_name":"Ada","last_name":null}
client.Contacts.Update(req)
```

Available: `UpdateContactRequest.ClearFirstName/ClearLastName`,
`UpdateBroadcastRequest.ClearTopicId`, `UpdateTemplateRequest.ClearSubject/ClearText/ClearAlias`,
`UpdateDomainRequest.ClearTrackingSubdomain`, `UpdateSegmentRequest.ClearFilter`. A `nil` value inside
`UpdateContactRequest.Properties` removes that key, and a nil
`UpdateContactPropertyRequest.FallbackValue` clears the fallback.

## Resources

### Emails

```go
client.Emails.Send(&posta.SendEmailRequest{
	From: "Acme <a@acme.dev>", To: []string{"b@x.dev"}, Subject: "Hi",
	Html: "<p>Hi</p>", Text: "Hi",
	Cc: []string{"cc@x.dev"}, Bcc: []string{"bcc@x.dev"}, ReplyTo: "r@acme.dev",
	ScheduledAt: "in 2 hours",
	Tags:        []posta.Tag{{Name: "campaign", Value: "launch"}},
	TopicId:     topicID, // recipients opted out of the topic are skipped
	Headers:     map[string]string{"X-Entity-Ref-ID": "123"},
	Attachments: []*posta.Attachment{{Filename: "hi.txt", Content: []byte("hello"), ContentType: "text/plain"}},
}, posta.WithIdempotencyKey("key"))
client.Emails.Get(id)         // includes Score (*float64; nil when no insights)
client.Emails.List(&posta.ListOptions{Limit: 50})
client.Emails.Update(&posta.UpdateEmailRequest{Id: id, ScheduledAt: "2026-09-10T09:00:00Z"}) // reschedule
client.Emails.Cancel(id)      // scheduled, unsent emails only
client.Emails.Remove(id)      // deletes the record and its events
client.Emails.GetInsights(id) // per-email deliverability report; 404 until computed

client.Batch.Send([]*posta.SendEmailRequest{a, b}, posta.WithIdempotencyKey("key")) // up to 100
```

`Attachment.Content` is raw bytes; it is base64-encoded on the wire. `Template`
is passed through unchanged: the API does not support stored-template sends
yet and answers `422` (send `Html`/`Text` instead).

### Contacts

Contacts are team-global: one list per team, unique by email
(case-insensitive). Creating a duplicate is a `409 validation_error`.

```go
client.Contacts.Create(&posta.CreateContactRequest{
	Email: "ada@acme.dev", FirstName: "Ada",
	Properties: map[string]any{"plan": "pro"},
	Segments:   []posta.ContactSegmentRef{{Id: segmentID}},
	Topics:     []posta.ContactTopicUpdate{{Id: topicID, Subscription: "opt_in"}},
})
client.Contacts.Get(posta.ContactAddress{Email: "ada@acme.dev"}) // id or email (email wins)
client.Contacts.Update(&posta.UpdateContactRequest{
	Id: contactID, Unsubscribed: posta.Ptr(true), FirstName: posta.Ptr("Ada"),
}) // nil fields are left unchanged
client.Contacts.Remove(posta.ContactAddress{Email: "ada@acme.dev"}) // its emails stay in the send log
client.Contacts.Remove(posta.ContactAddress{Email: "ada@acme.dev"},
	posta.WithErase()) // also scrubs the address from email history, events and API logs (GDPR/LGPD)
client.Contacts.List(&posta.ListOptions{Limit: 50})
// Bulk read (Posta extension): attach the property map and the topic
// subscriptions to every item, so an audience reads in one request per 100
// contacts instead of one per contact. Segments.ListContacts takes it too.
client.Contacts.List(&posta.ListOptions{Limit: 100},
	posta.WithInclude(posta.ContactIncludeProperties, posta.ContactIncludeTopics))
// → Data[i].Properties (map[string]ContactPropertyValue) and Data[i].Topics ([]ContactTopic);
//   nil without the facet

// Topic subscriptions (granular unsubscribe)
client.Contacts.UpdateTopics(
	posta.ContactAddress{Email: "ada@acme.dev"},
	[]posta.ContactTopicUpdate{{Id: topicID, Subscription: "opt_out"}},
)
client.Contacts.Topics.List(posta.ContactAddress{Email: "ada@acme.dev"})
// → Data[i]{Id, Name, Description, Subscription: "opt_in" | "opt_out", Explicit, Visibility}
//   Subscription is the effective choice; Explicit is false when it is the topic's default

// Preference center (Posta extension): the hosted page the unsubscribe
// links open, for deep-linking from your own settings screen. No expiry and
// anyone holding it can change that contact's preferences, so hand it only to
// the contact. 422 when the instance cannot build hosted links.
link, _ := client.Contacts.CreatePreferencesLink(posta.ContactAddress{Email: "ada@acme.dev"})
// link.Url

// Segment membership
client.Contacts.Segments.Add(&posta.AddContactSegmentRequest{SegmentId: segmentID, ContactId: contactID})
client.Contacts.Segments.Remove(&posta.RemoveContactSegmentRequest{SegmentId: segmentID, Email: "ada@acme.dev"})
```

`Contact.Properties` is `map[string]ContactPropertyValue{Type, Value}`: the
typed `{type, value}` objects the API returns.

#### Bulk create, read and delete (Posta extension)

`POST /contacts/batch` writes up to 1000 contacts in one call. `WithOnConflict`
decides what happens to an email that already exists: `OnConflictError`
(default), `OnConflictSkip` (keep the existing contact, report its id) or
`OnConflictUpsert` (merge names/properties, add segments and topics). A batch
never re-subscribes anyone.

```go
res, err := client.Contacts.Batch.Create([]*posta.CreateContactRequest{
	{Email: "a@x.dev"}, {Email: "b@x.dev", FirstName: "B"},
}, posta.WithOnConflict(posta.OnConflictUpsert),
	posta.WithBatchValidation(posta.BatchValidationPermissive))
// res.Data[i]  → {Index, Id, Status: "created" | "updated" | "skipped"}
// res.Counts   → {Created, Updated, Skipped, Failed}
// res.Errors   → permissive mode only: failed items by index
```

`POST /contacts/batch/get` reads up to 1000 contacts by id or email in one
call (one request against the rate limit), in request order. Entries that
match no contact are listed in `Missing` instead of failing the call;
`WithInclude` attaches `Properties` and/or `Topics` to each contact.

```go
res, err := client.Contacts.Batch.Get([]posta.ContactAddress{{Id: contactID}, {Email: "b@x.dev"}},
	posta.WithInclude(posta.ContactIncludeTopics))
// res.Data[i]    → {Object: "contact", Id, Email, FirstName, LastName, CreatedAt, Unsubscribed, Topics}
// res.Missing[i] → {Index, Id | Email}: request entries that matched nobody
```

`POST /contacts/batch/remove` deletes up to 1000 contacts by `Ids` or by
`Emails` (exactly one of the two; emails match case-insensitively) and lists
only the rows actually deleted. Each deletion is the same as `Contacts.Remove`:
the emails stay in the send log, and `Erase: true` also scrubs each address
from email history, event payloads and API logs.

```go
rm, err := client.Contacts.Batch.Remove(&posta.BatchRemoveContactsRequest{Emails: []string{"a@x.dev", "b@x.dev"}})
// rm.Data[i] → {Object: "contact", Contact: id, Deleted: true}
rm, err = client.Contacts.Batch.Remove(&posta.BatchRemoveContactsRequest{Ids: ids, Erase: true}) // GDPR/LGPD erasure
```

### Contact properties

The schema of the custom properties contacts carry. `Type` is `"string"` or
`"number"`; `FallbackValue` fills merge fields when a contact has no value.

```go
client.ContactProperties.Create(&posta.CreateContactPropertyRequest{Key: "plan", Type: "string", FallbackValue: "free"})
client.ContactProperties.List(nil)
client.ContactProperties.Get(id)
client.ContactProperties.Update(id, &posta.UpdateContactPropertyRequest{FallbackValue: "trial"}) // nil clears
client.ContactProperties.Remove(id)
```

### Topics

```go
client.Topics.Create(&posta.CreateTopicRequest{Name: "Product updates", DefaultSubscription: "opt_in", Visibility: "public"})
client.Topics.Get(id)
client.Topics.List()   // unpaginated: HasMore is always false
client.Topics.Update(id, &posta.UpdateTopicRequest{Description: "Monthly digest"})
client.Topics.Remove(id)
```

### Broadcasts

Targeting is an optional `SegmentId` and/or `TopicId`; set neither to send to
all the team's contacts. `Send: true` sends (or, with `ScheduledAt`, schedules)
on create instead of saving a draft.

```go
b, _ := client.Broadcasts.Create(&posta.CreateBroadcastRequest{
	SegmentId: segmentID, From: "Acme <news@acme.dev>", Subject: "Launch",
	Html: "<p>Hi {{{FIRST_NAME|there}}}</p>", PreviewText: "It's here",
})
client.Broadcasts.List(nil)
client.Broadcasts.Get(b.Id)
client.Broadcasts.Update(b.Id, &posta.UpdateBroadcastRequest{Subject: "Launch 🚀"}) // draft only
client.Broadcasts.Send(b.Id, &posta.SendBroadcastRequest{ScheduledAt: "2026-09-01T09:00:00Z"}) // nil to send now
client.Broadcasts.Cancel(b.Id) // scheduled only
client.Broadcasts.Remove(b.Id) // draft only
```

### Suppressions

The team's do-not-send list. `Origin` is `bounce`, `complaint`, `manual`
(default) or `unsubscribe` (constants `SuppressionOrigin…`). Adding is
idempotent: an address already suppressed keeps its entry and origin.

```go
client.Suppressions.Add(&posta.AddSuppressionRequest{Email: "gone@x.dev"})
client.Suppressions.Get("gone@x.dev") // id or email
client.Suppressions.List(&posta.ListSuppressionsOptions{Origin: posta.SuppressionOriginBounce, Limit: 50})
client.Suppressions.Remove("gone@x.dev")

client.Suppressions.Batch.Add(&posta.BatchAddSuppressionsRequest{Emails: []string{"a@x.dev", "b@x.dev"}}) // up to 1000
client.Suppressions.Batch.Remove(&posta.BatchRemoveSuppressionsRequest{Emails: []string{"a@x.dev"}})     // or Ids
```

### Domains

```go
d, _ := client.Domains.Create(&posta.CreateDomainRequest{
	Name: "acme.dev", ClickTracking: posta.Ptr(true), TrackingSubdomain: "links",
})
for _, r := range d.Records { fmt.Println(r.Record, r.Type, r.Name, r.Value) } // DNS to publish
client.Domains.List(nil)
client.Domains.Get(d.Id)
client.Domains.Verify(d.Id) // re-checks DNS; returns per-record Status
client.Domains.Update(d.Id, &posta.UpdateDomainRequest{OpenTracking: posta.Ptr(true)})
client.Domains.Remove(d.Id)
```

`Region` must match the deployment's SES region: omit it to use the default.
`UpdateDomainRequest.Tls` is passed through unchanged: the API does not expose
a TLS policy and answers `422` rather than dropping it.

### Webhooks

Events: `email.sent`, `email.delivered`, `email.delivery_delayed`,
`email.bounced`, `email.complained`, `email.opened`, `email.clicked`,
`contact.created`, `contact.updated`, `contact.deleted`, plus the Posta
extensions `contact.unsubscribed`, `contact.resubscribed`,
`contact.topic_opt_in`, `contact.topic_opt_out`, `suppression.added`,
`suppression.removed`, `deliverability.warning`, `deliverability.paused`,
`quota.warning`, `quota.reached`, `quota.paused`.

```go
w, _ := client.Webhooks.Create(&posta.CreateWebhookRequest{
	Endpoint: "https://acme.dev/hooks/posta",
	Events:   []string{"email.delivered", "email.bounced"},
}) // w.SigningSecret
client.Webhooks.List(nil)           // rows never carry the secret
client.Webhooks.Get(w.Id)           // includes SigningSecret and PreviousSecretExpiresAt
client.Webhooks.Update(w.Id, &posta.UpdateWebhookRequest{Status: "disabled"})
client.Webhooks.Remove(w.Id)

// Rotate the secret (Posta extension). For OverlapHours (default 24,
// up to 72) every delivery carries both signatures, so the receiver can
// switch at any point in the window; Ptr(0) drops the old secret at once.
r, _ := client.Webhooks.Rotate(w.Id, &posta.RotateWebhookSecretRequest{OverlapHours: posta.Ptr(48)})
// r.SigningSecret, r.PreviousSecretExpiresAt (*string; nil once the old secret is gone)
```

Pass `SigningSecret` on create (or rotate) to carry over an existing `whsec_…`
secret.

### API keys

```go
k, _ := client.ApiKeys.Create(&posta.CreateApiKeyRequest{
	Name: "ci", Permission: "sending_access", DomainId: domainID,
}) // k.Token is returned only here
client.ApiKeys.List(nil)
client.ApiKeys.Remove(k.Id)
```

### Templates

Every method takes the template id or its alias. Templates have no
draft/publish cycle (every save is live) so `Publish` is a no-op kept for
resend-go compatibility.

```go
t, _ := client.Templates.Create(&posta.CreateTemplateRequest{
	Name: "Welcome", Alias: "welcome", Subject: "Hi {{{FIRST_NAME|there}}}", Html: "<p>Welcome</p>",
})
client.Templates.List(nil)
client.Templates.Get("welcome")
client.Templates.Update("welcome", &posta.UpdateTemplateRequest{Subject: "Hello"})
client.Templates.Duplicate(t.Id) // "<name> (copy)", no alias
client.Templates.Publish(t.Id)   // no-op
client.Templates.Remove(t.Id)
```

`From`, `ReplyTo` and `Variables` are accepted for resend-go compatibility and
passed through unchanged; the API does not support them yet and answers `422`
(they read back as `""`, `nil` and empty).

### Segments (Posta extension)

Segments are a saved filter over the team's contacts: a Posta superset
with no Resend equivalent (served at `/segments`). Omit `Filter` to create a
manual segment, whose members come only from `Contacts.Segments.Add` and
`CreateContactRequest.Segments`.

```go
client.Segments.Create(&posta.CreateSegmentRequest{
	Name: "Pro plan",
	Filter: posta.SegmentFilter{
		Match: "all",
		Conditions: []posta.SegmentCondition{
			{Field: "property:plan", Op: "equals", Value: "pro"},
			{Field: "first_name", Op: "is_set"}, // presence ops ignore Value
		},
	},
})
client.Segments.Create(&posta.CreateSegmentRequest{Name: "VIPs"}) // manual segment
client.Segments.Get(id) // includes a live ContactCount
client.Segments.List(nil)
client.Segments.ListContacts(id, &posta.ListOptions{Limit: 100}) // takes WithInclude like Contacts.List
client.Segments.Update(id, &posta.UpdateSegmentRequest{Name: "Pro tier"})
client.Segments.Remove(id)
```

`UpdateSegmentRequest.ClearFilter()` sends `filter: null`, turning a filtered
segment into a manual one.

### Deliverability (Posta extension)

The account-level deliverability score over the trailing window. Nullable
scores (`Score`, `Band`, `ContentScore`, `OutcomeScore`) are pointers: nil
means not enough data yet. Band, check severity/status and guardrail status
are plain strings: new values may appear without an SDK update.

```go
d, _ := client.Deliverability.Get()
if d.Score != nil {
	fmt.Printf("%.1f (%s)\n", *d.Score, *d.Band)
}
```

### Usage (Posta extension)

The effective plan, its limits and today's accepted send count. `Plan` and the
`Limits` are nil on a self-hosted instance.

```go
u, _ := client.Usage.Get()
fmt.Println(u.Today.EmailsSent, "sent today; resets", u.Today.ResetsAt)
```

## Migrating from Resend

```diff
- import "github.com/resend/resend-go/v4"
- client := resend.NewClient("re_123")
+ import posta "github.com/ChxisB/posta/packages/sdk/go"
+ client := posta.NewClient("po_123")
+ client.BaseURL = "https://mail.acme.dev" // self-hosted only
```

Method names and nesting match (`client.Emails.Send`, `client.Contacts`,
`client.Broadcasts`, `client.Domains`, `client.ApiKeys`, `client.Webhooks`,
`client.Templates`, `client.Suppressions.Batch`, …). Notes:

- **No audiences**: Posta contacts are one team-global list. Drop the
  audience id from `.Contacts` calls; target broadcasts with a `.Segments`
  filter (or a topic) instead. The API keeps `/audiences/*` only as a
  compatibility shim for raw HTTP clients; it is not part of this SDK.
- **Pagination** is `*ListOptions{Limit, After, Before}` (plain values, not
  pointers) passed to `List`.
- **Contacts are addressed** with `ContactAddress{Id | Email}` instead of
  per-call option structs.
- **Template sends** (`SendEmailRequest.Template`) are passed through but
  answered with `422`: the API does not render stored templates yet.
- **Extensions with no Resend counterpart**: `Segments`, `Contacts.Batch`,
  `Contacts.CreatePreferencesLink`, `Webhooks.Rotate`, `Deliverability`,
  `Usage`, `Emails.GetInsights`, the `unsubscribe` suppression origin, and
  the `deliverability.*` / `quota.*` / `suppression.*` webhook events (plus
  the `contact.*` events beyond Resend's created/updated/deleted).

## License

MIT

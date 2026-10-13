package millionsend

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A body that decodes into every response type used below (unknown fields are
// ignored, lists get an empty data array).
const anyOK = `{"object":"x","id":"1","data":[],"has_more":false,"deleted":true}`

func TestUserAgentCarriesVersion(t *testing.T) {
	c, rec := mockServer(t, 200, anyOK)
	_, err := c.Usage.Get()
	require.NoError(t, err)
	assert.Equal(t, "millionsend-go/0.8.0", rec.Header.Get("User-Agent"))
}

func TestSendFullWireBody(t *testing.T) {
	c, rec := mockServer(t, 200, `{"id":"abc"}`)
	_, err := c.Emails.Send(&SendEmailRequest{
		From:        "Acme <a@x.dev>",
		To:          []string{"b@x.dev", "c@x.dev"},
		Subject:     "s",
		Html:        "<p>h</p>",
		Text:        "t",
		Cc:          []string{"cc@x.dev"},
		Bcc:         []string{"bcc@x.dev"},
		ReplyTo:     "r@x.dev",
		ScheduledAt: "2999-01-01T00:00:00Z",
		Tags:        []Tag{{Name: "k", Value: "v"}},
		TopicId:     "11111111-1111-4111-8111-111111111111",
		Attachments: []*Attachment{{
			Filename:    "hi.txt",
			Content:     []byte("hello"),
			ContentType: "text/plain",
			ContentId:   "cid1",
			Path:        "https://x.dev/hi.txt",
		}},
		Headers:  map[string]string{"X-Entity-Ref-ID": "123"},
		Template: &EmailTemplate{Id: "welcome", Variables: map[string]any{"NAME": "Ada"}},
	})
	require.NoError(t, err)
	assert.JSONEq(t, `{
		"from":"Acme <a@x.dev>",
		"to":["b@x.dev","c@x.dev"],
		"subject":"s",
		"html":"<p>h</p>",
		"text":"t",
		"cc":["cc@x.dev"],
		"bcc":["bcc@x.dev"],
		"reply_to":"r@x.dev",
		"scheduled_at":"2999-01-01T00:00:00Z",
		"tags":[{"name":"k","value":"v"}],
		"topic_id":"11111111-1111-4111-8111-111111111111",
		"attachments":[{"filename":"hi.txt","content":"aGVsbG8=","content_type":"text/plain","content_id":"cid1","path":"https://x.dev/hi.txt"}],
		"headers":{"X-Entity-Ref-ID":"123"},
		"template":{"id":"welcome","variables":{"NAME":"Ada"}}
	}`, string(rec.Body))
}

func TestSendWithOptionsResendShape(t *testing.T) {
	c, rec := mockServer(t, 200, `{"id":"abc"}`)
	_, err := c.Emails.SendWithOptions(context.Background(), sampleEmail(), &SendEmailOptions{IdempotencyKey: "k-1"})
	require.NoError(t, err)
	assert.Equal(t, "k-1", rec.Header.Get("Idempotency-Key"))

	_, err = c.Emails.SendWithOptions(context.Background(), sampleEmail(), nil)
	require.NoError(t, err)
	assert.Empty(t, rec.Header.Get("Idempotency-Key"))
}

func TestBatchValidationHeaderAndErrors(t *testing.T) {
	c, rec := mockServer(t, 200, `{"data":[{"id":"1"}],"errors":[{"index":1,"message":"emails.1: invalid to"}]}`)
	res, err := c.Batch.SendWithOptions(context.Background(), []*SendEmailRequest{sampleEmail(), sampleEmail()},
		&BatchSendEmailOptions{IdempotencyKey: "b-1", BatchValidation: BatchValidationPermissive})
	require.NoError(t, err)
	assert.Equal(t, http.MethodPost, rec.Method)
	assert.Equal(t, "/emails/batch", rec.Path)
	assert.Equal(t, "permissive", rec.Header.Get("x-batch-validation"))
	assert.Equal(t, "b-1", rec.Header.Get("Idempotency-Key"))
	require.Len(t, res.Data, 1)
	require.Len(t, res.Errors, 1)
	assert.Equal(t, 1, res.Errors[0].Index)
	assert.Equal(t, "emails.1: invalid to", res.Errors[0].Message)

	// Functional-option form.
	_, err = c.Batch.Send([]*SendEmailRequest{sampleEmail()}, WithBatchValidation(BatchValidationStrict))
	require.NoError(t, err)
	assert.Equal(t, "strict", rec.Header.Get("x-batch-validation"))

	// No header unless asked (the server default is strict).
	_, err = c.Batch.Send([]*SendEmailRequest{sampleEmail()})
	require.NoError(t, err)
	assert.Empty(t, rec.Header.Get("x-batch-validation"))
}

func TestEmailsListUpdateRemove(t *testing.T) {
	c, rec := mockServer(t, 200, `{"object":"list","data":[{"id":"e1","to":["b@x.dev"],"cc":null,"scheduled_at":null}],"has_more":false}`)
	list, err := c.Emails.List(&ListOptions{Limit: 5, After: "cur"})
	require.NoError(t, err)
	assert.Equal(t, http.MethodGet, rec.Method)
	assert.Equal(t, "/emails", rec.Path)
	assert.Equal(t, "after=cur&limit=5", rec.RawQuery)
	require.Len(t, list.Data, 1)
	assert.Equal(t, "e1", list.Data[0].Id)
	assert.Nil(t, list.Data[0].Cc)

	c, rec = mockServer(t, 200, `{"object":"email","id":"e1"}`)
	_, err = c.Emails.Update(&UpdateEmailRequest{Id: "e1", ScheduledAt: "2999-01-01T00:00:00Z"})
	require.NoError(t, err)
	assert.Equal(t, http.MethodPatch, rec.Method)
	assert.Equal(t, "/emails/e1", rec.Path)
	assert.JSONEq(t, `{"scheduled_at":"2999-01-01T00:00:00Z"}`, string(rec.Body))

	rm, err := c.Emails.Remove("e1")
	require.NoError(t, err)
	assert.Equal(t, http.MethodDelete, rec.Method)
	assert.Equal(t, "/emails/e1", rec.Path)
	assert.Equal(t, "e1", rm.Id)
}

func TestContactsCreateFullBody(t *testing.T) {
	c, rec := mockServer(t, 200, `{"object":"contact","id":"c1"}`)
	_, err := c.Contacts.Create(&CreateContactRequest{
		Email:        "ada@x.dev",
		FirstName:    "Ada",
		LastName:     "Lovelace",
		Unsubscribed: true,
		Properties:   map[string]any{"plan": "pro", "seats": 3},
		Segments:     []ContactSegmentRef{{Id: "s1"}},
		Topics:       []ContactTopicUpdate{{Id: "t1", Subscription: "opt_out"}},
	})
	require.NoError(t, err)
	assert.JSONEq(t, `{
		"email":"ada@x.dev","first_name":"Ada","last_name":"Lovelace","unsubscribed":true,
		"properties":{"plan":"pro","seats":3},
		"segments":[{"id":"s1"}],
		"topics":[{"id":"t1","subscription":"opt_out"}]
	}`, string(rec.Body))
}

func TestContactsUpdateClearsWithNull(t *testing.T) {
	c, rec := mockServer(t, 200, `{"object":"contact","id":"c1"}`)
	req := &UpdateContactRequest{Id: "c1", FirstName: Ptr("Ada"), Properties: map[string]any{"plan": nil}}
	req.ClearLastName()
	_, err := c.Contacts.Update(req)
	require.NoError(t, err)
	assert.Equal(t, "/contacts/c1", rec.Path)
	assert.JSONEq(t, `{"first_name":"Ada","last_name":null,"properties":{"plan":null}}`, string(rec.Body))

	// Clearing without any other field still yields a body with only the null.
	req = &UpdateContactRequest{Email: "ada@x.dev"}
	req.ClearFirstName()
	_, err = c.Contacts.Update(req)
	require.NoError(t, err)
	assert.JSONEq(t, `{"first_name":null}`, string(rec.Body))
}

func TestContactGetDecodesTypedProperties(t *testing.T) {
	c, _ := mockServer(t, 200, `{"object":"contact","id":"c1","email":"ada@x.dev","first_name":null,"last_name":null,
		"created_at":"2026-01-01T00:00:00Z","unsubscribed":false,
		"properties":{"plan":{"type":"string","value":"pro"},"seats":{"type":"number","value":3}}}`)
	got, err := c.Contacts.Get(ContactAddress{Id: "c1"})
	require.NoError(t, err)
	assert.Equal(t, "", got.FirstName)
	require.Len(t, got.Properties, 2)
	assert.Equal(t, ContactPropertyValue{Type: "string", Value: "pro"}, got.Properties["plan"])
	assert.Equal(t, ContactPropertyValue{Type: "number", Value: float64(3)}, got.Properties["seats"])
}

func TestContactsBatchCreate(t *testing.T) {
	c, rec := mockServer(t, 200, `{
		"data":[{"object":"contact","index":0,"id":"c1","status":"created"},{"object":"contact","index":2,"id":"c2","status":"updated"}],
		"counts":{"created":1,"updated":1,"skipped":0,"failed":1},
		"errors":[{"index":1,"message":"contacts.1: invalid email"}]}`)
	res, err := c.Contacts.Batch.Create([]*CreateContactRequest{
		{Email: "a@x.dev"}, {Email: "nope"}, {Email: "b@x.dev", FirstName: "B"},
	}, WithOnConflict(OnConflictUpsert), WithBatchValidation(BatchValidationPermissive))
	require.NoError(t, err)
	assert.Equal(t, http.MethodPost, rec.Method)
	assert.Equal(t, "/contacts/batch", rec.Path)
	assert.Equal(t, "on_conflict=upsert", rec.RawQuery)
	assert.Equal(t, "permissive", rec.Header.Get("x-batch-validation"))
	assert.JSONEq(t, `[{"email":"a@x.dev"},{"email":"nope"},{"email":"b@x.dev","first_name":"B"}]`, string(rec.Body))
	require.Len(t, res.Data, 2)
	assert.Equal(t, BatchContactResult{Object: "contact", Index: 2, Id: "c2", Status: "updated"}, res.Data[1])
	assert.Equal(t, BatchContactsCounts{Created: 1, Updated: 1, Skipped: 0, Failed: 1}, res.Counts)
	require.Len(t, res.Errors, 1)
	assert.Equal(t, BatchError{Index: 1, Message: "contacts.1: invalid email"}, res.Errors[0])

	// Defaults: no query, no header.
	_, err = c.Contacts.Batch.CreateWithContext(context.Background(), []*CreateContactRequest{{Email: "a@x.dev"}})
	require.NoError(t, err)
	assert.Empty(t, rec.RawQuery)
	assert.Empty(t, rec.Header.Get("x-batch-validation"))
}

func TestContactsBatchRemove(t *testing.T) {
	c, rec := mockServer(t, 200, `{"data":[{"object":"contact","contact":"c1","deleted":true}]}`)
	rm, err := c.Contacts.Batch.Remove(&BatchRemoveContactsRequest{Ids: []string{"c1", "c2"}})
	require.NoError(t, err)
	assert.Equal(t, http.MethodPost, rec.Method)
	assert.Equal(t, "/contacts/batch/remove", rec.Path)
	assert.JSONEq(t, `{"ids":["c1","c2"]}`, string(rec.Body))
	require.Len(t, rm.Data, 1)
	assert.Equal(t, RemoveContactResponse{Object: "contact", Contact: "c1", Deleted: true}, rm.Data[0])

	_, err = c.Contacts.Batch.RemoveWithContext(context.Background(), &BatchRemoveContactsRequest{Emails: []string{"a@x.dev"}})
	require.NoError(t, err)
	assert.JSONEq(t, `{"emails":["a@x.dev"]}`, string(rec.Body))

	_, err = c.Contacts.Batch.Remove(&BatchRemoveContactsRequest{Ids: []string{"c1"}, Erase: true})
	require.NoError(t, err)
	assert.JSONEq(t, `{"ids":["c1"],"erase":true}`, string(rec.Body))
}

func TestContactsListInclude(t *testing.T) {
	c, rec := mockServer(t, 200, `{"object":"list","has_more":false,"data":[
		{"id":"c1","email":"a@x.dev","first_name":"A","last_name":"","created_at":"2026-01-01T00:00:00Z","unsubscribed":false,
		 "properties":{"plan":{"type":"string","value":"pro"},"seats":{"type":"number","value":3}},
		 "topics":[{"id":"t1","name":"News","description":null,"subscription":"opt_in","explicit":false,"visibility":"public"}]}]}`)
	res, err := c.Contacts.List(&ListOptions{Limit: 100}, WithInclude(ContactIncludeProperties, ContactIncludeTopics))
	require.NoError(t, err)
	assert.Equal(t, http.MethodGet, rec.Method)
	assert.Equal(t, "/contacts", rec.Path)
	assert.Equal(t, "include=properties%2Ctopics&limit=100", rec.RawQuery)
	require.Len(t, res.Data, 1)
	assert.Equal(t, map[string]ContactPropertyValue{
		"plan":  {Type: "string", Value: "pro"},
		"seats": {Type: "number", Value: float64(3)},
	}, res.Data[0].Properties)
	assert.Equal(t, []ContactTopic{{Id: "t1", Name: "News", Subscription: "opt_in", Visibility: "public"}}, res.Data[0].Topics)

	// The facet rides alone when there are no pagination options.
	_, err = c.Contacts.List(nil, WithInclude(ContactIncludeTopics))
	require.NoError(t, err)
	assert.Equal(t, "include=topics", rec.RawQuery)

	// Without WithInclude the query is the plain pagination.
	_, err = c.Contacts.List(&ListOptions{Limit: 100})
	require.NoError(t, err)
	assert.Equal(t, "limit=100", rec.RawQuery)
}

func TestContactsBatchGet(t *testing.T) {
	c, rec := mockServer(t, 200, `{"object":"list","data":[
		{"object":"contact","id":"c1","email":"a@x.dev","first_name":"A","last_name":"","created_at":"2026-01-01T00:00:00Z","unsubscribed":false,
		 "properties":{"plan":{"type":"string","value":"pro"}},"topics":[]}],
		"missing":[{"index":1,"email":"b@x.dev"},{"index":2,"id":"c3"}]}`)
	res, err := c.Contacts.Batch.Get([]ContactAddress{{Id: "c1"}, {Email: "b@x.dev"}, {Id: "c3"}},
		WithInclude(ContactIncludeProperties, ContactIncludeTopics))
	require.NoError(t, err)
	assert.Equal(t, http.MethodPost, rec.Method)
	assert.Equal(t, "/contacts/batch/get", rec.Path)
	assert.Empty(t, rec.RawQuery)
	assert.JSONEq(t, `{"contacts":[{"id":"c1"},{"email":"b@x.dev"},{"id":"c3"}],"include":["properties","topics"]}`, string(rec.Body))
	assert.Equal(t, "list", res.Object)
	require.Len(t, res.Data, 1)
	assert.Equal(t, BatchGetContact{Object: "contact", ContactListItem: ContactListItem{
		Id: "c1", Email: "a@x.dev", FirstName: "A", CreatedAt: "2026-01-01T00:00:00Z",
		Properties: map[string]ContactPropertyValue{"plan": {Type: "string", Value: "pro"}},
		Topics:     []ContactTopic{},
	}}, res.Data[0])
	assert.Equal(t, []BatchGetMissingContact{{Index: 1, Email: "b@x.dev"}, {Index: 2, Id: "c3"}}, res.Missing)

	// Email wins over Id in an address; without WithInclude no include key is sent.
	_, err = c.Contacts.Batch.GetWithContext(context.Background(), []ContactAddress{{Id: "c2", Email: "c@x.dev"}})
	require.NoError(t, err)
	assert.JSONEq(t, `{"contacts":[{"email":"c@x.dev"}]}`, string(rec.Body))
}

func TestContactsCreatePreferencesLink(t *testing.T) {
	c, rec := mockServer(t, 200, `{"object":"preferences_link","contact":"c1","url":"https://app.x.dev/p/tok"}`)
	link, err := c.Contacts.CreatePreferencesLink(ContactAddress{Email: "ada@x.dev"})
	require.NoError(t, err)
	assert.Equal(t, http.MethodPost, rec.Method)
	assert.Equal(t, "/contacts/ada@x.dev/preferences-link", rec.Path)
	assert.Empty(t, rec.Body)
	assert.Equal(t, ContactPreferencesLink{Object: "preferences_link", Contact: "c1", Url: "https://app.x.dev/p/tok"}, *link)

	_, err = c.Contacts.CreatePreferencesLink(ContactAddress{Id: "c1"})
	require.NoError(t, err)
	assert.Equal(t, "/contacts/c1/preferences-link", rec.Path)

	c, _ = mockServer(t, 422, `{"statusCode":422,"name":"validation_error","message":"APP_BASE_URL and MASTER_ENCRYPTION_KEY must be set to mint preference links"}`)
	_, err = c.Contacts.CreatePreferencesLink(ContactAddress{Id: "c1"})
	var mse *MillionSendError
	require.ErrorAs(t, err, &mse)
	assert.Equal(t, 422, mse.StatusCode)
	assert.Equal(t, "validation_error", mse.Name)
}

func TestContactsSegmentsAddRemove(t *testing.T) {
	c, rec := mockServer(t, 200, `{"id":"c1","audienceId":"s1","deleted":true}`)
	add, err := c.Contacts.Segments.Add(&AddContactSegmentRequest{SegmentId: "s1", ContactId: "c1"})
	require.NoError(t, err)
	assert.Equal(t, http.MethodPost, rec.Method)
	assert.Equal(t, "/contacts/c1/segments/s1", rec.Path)
	assert.Empty(t, rec.Body)
	assert.Equal(t, "c1", add.Id)

	rm, err := c.Contacts.Segments.Remove(&RemoveContactSegmentRequest{SegmentId: "s1", Email: "ada@x.dev"})
	require.NoError(t, err)
	assert.Equal(t, http.MethodDelete, rec.Method)
	assert.Equal(t, "/contacts/ada@x.dev/segments/s1", rec.Path)
	assert.Equal(t, "s1", rm.AudienceId)
	assert.True(t, rm.Deleted)
}

func TestBroadcastsFullBodyAndClearTopic(t *testing.T) {
	c, rec := mockServer(t, 200, `{"id":"b1"}`)
	_, err := c.Broadcasts.Create(&CreateBroadcastRequest{
		Name: "Launch", SegmentId: "s1", From: "Acme <news@x.dev>", Subject: "Hi",
		Html: "<p>h</p>", Text: "t", ReplyTo: "r@x.dev", PreviewText: "pre", TopicId: "t1",
		Send: true, ScheduledAt: "in 1 hour",
	})
	require.NoError(t, err)
	assert.JSONEq(t, `{"name":"Launch","segment_id":"s1","from":"Acme <news@x.dev>","subject":"Hi","html":"<p>h</p>","text":"t",
		"reply_to":"r@x.dev","preview_text":"pre","topic_id":"t1","send":true,"scheduled_at":"in 1 hour"}`, string(rec.Body))

	upd := &UpdateBroadcastRequest{Subject: "New", PreviewText: "p2"}
	upd.ClearTopicId()
	_, err = c.Broadcasts.Update("b1", upd)
	require.NoError(t, err)
	assert.Equal(t, http.MethodPatch, rec.Method)
	assert.JSONEq(t, `{"subject":"New","preview_text":"p2","topic_id":null}`, string(rec.Body))

	// Without Clear, topic_id is simply omitted.
	_, err = c.Broadcasts.Update("b1", &UpdateBroadcastRequest{TopicId: "t2"})
	require.NoError(t, err)
	assert.JSONEq(t, `{"topic_id":"t2"}`, string(rec.Body))
}

func TestTopicsVisibilityAndUpdate(t *testing.T) {
	c, rec := mockServer(t, 200, `{"id":"t1"}`)
	_, err := c.Topics.Create(&CreateTopicRequest{Name: "News", DefaultSubscription: "opt_in", Visibility: "public"})
	require.NoError(t, err)
	assert.JSONEq(t, `{"name":"News","default_subscription":"opt_in","visibility":"public"}`, string(rec.Body))

	_, err = c.Topics.Update("t1", &UpdateTopicRequest{Description: "d", Visibility: "private"})
	require.NoError(t, err)
	assert.Equal(t, http.MethodPatch, rec.Method)
	assert.Equal(t, "/topics/t1", rec.Path)
	assert.JSONEq(t, `{"description":"d","visibility":"private"}`, string(rec.Body))
}

func TestSegmentsListContacts(t *testing.T) {
	c, rec := mockServer(t, 200, `{"object":"list","data":[{"id":"c1","email":"a@x.dev"}],"has_more":false}`)
	res, err := c.Segments.ListContacts("s1", &ListOptions{Limit: 10})
	require.NoError(t, err)
	assert.Equal(t, http.MethodGet, rec.Method)
	assert.Equal(t, "/segments/s1/contacts", rec.Path)
	assert.Equal(t, "limit=10", rec.RawQuery)
	require.Len(t, res.Data, 1)
	assert.Equal(t, "a@x.dev", res.Data[0].Email)

	_, err = c.Segments.ListContacts("s1", nil, WithInclude(ContactIncludeTopics))
	require.NoError(t, err)
	assert.Equal(t, "/segments/s1/contacts", rec.Path)
	assert.Equal(t, "include=topics", rec.RawQuery)
}

func TestSuppressions(t *testing.T) {
	c, rec := mockServer(t, 200, `{"object":"suppression","id":"s1","email":"a@x.dev","origin":"bounce","source_id":null,"created_at":"2026-01-01T00:00:00Z"}`)
	_, err := c.Suppressions.Add(&AddSuppressionRequest{Email: "a@x.dev", Origin: SuppressionOriginUnsubscribe})
	require.NoError(t, err)
	assert.Equal(t, http.MethodPost, rec.Method)
	assert.Equal(t, "/suppressions", rec.Path)
	assert.JSONEq(t, `{"email":"a@x.dev","origin":"unsubscribe"}`, string(rec.Body))

	_, err = c.Suppressions.Add(&AddSuppressionRequest{Email: "a@x.dev"})
	require.NoError(t, err)
	assert.JSONEq(t, `{"email":"a@x.dev"}`, string(rec.Body))

	got, err := c.Suppressions.Get("a@x.dev")
	require.NoError(t, err)
	assert.Equal(t, http.MethodGet, rec.Method)
	assert.Equal(t, "/suppressions/a@x.dev", rec.Path)
	assert.Equal(t, "bounce", got.Origin)
	assert.Nil(t, got.SourceId)

	_, err = c.Suppressions.Remove("s1")
	require.NoError(t, err)
	assert.Equal(t, http.MethodDelete, rec.Method)
	assert.Equal(t, "/suppressions/s1", rec.Path)

	c, rec = mockServer(t, 200, `{"object":"list","data":[],"has_more":false}`)
	_, err = c.Suppressions.List(&ListSuppressionsOptions{Origin: SuppressionOriginComplaint, Limit: 5, After: "cur"})
	require.NoError(t, err)
	assert.Equal(t, "/suppressions", rec.Path)
	assert.Equal(t, "after=cur&limit=5&origin=complaint", rec.RawQuery)

	_, err = c.Suppressions.List(nil)
	require.NoError(t, err)
	assert.Empty(t, rec.RawQuery)
}

func TestSuppressionsBatch(t *testing.T) {
	c, rec := mockServer(t, 200, `{"data":[{"object":"suppression","id":"s1"},{"object":"suppression","id":"s2"}]}`)
	res, err := c.Suppressions.Batch.Add(&BatchAddSuppressionsRequest{Emails: []string{"a@x.dev", "b@x.dev"}, Origin: SuppressionOriginManual})
	require.NoError(t, err)
	assert.Equal(t, http.MethodPost, rec.Method)
	assert.Equal(t, "/suppressions/batch/add", rec.Path)
	assert.JSONEq(t, `{"emails":["a@x.dev","b@x.dev"],"origin":"manual"}`, string(rec.Body))
	assert.Len(t, res.Data, 2)

	c, rec = mockServer(t, 200, `{"data":[{"object":"suppression","id":"s1","deleted":true}]}`)
	rm, err := c.Suppressions.Batch.Remove(&BatchRemoveSuppressionsRequest{Ids: []string{"s1"}})
	require.NoError(t, err)
	assert.Equal(t, "/suppressions/batch/remove", rec.Path)
	assert.JSONEq(t, `{"ids":["s1"]}`, string(rec.Body))
	require.Len(t, rm.Data, 1)
	assert.True(t, rm.Data[0].Deleted)

	_, err = c.Suppressions.Batch.Remove(&BatchRemoveSuppressionsRequest{Emails: []string{"a@x.dev"}})
	require.NoError(t, err)
	assert.JSONEq(t, `{"emails":["a@x.dev"]}`, string(rec.Body))
}

func TestDomains(t *testing.T) {
	c, rec := mockServer(t, 200, `{"object":"domain","id":"d1","name":"x.dev","status":"pending","created_at":"2026-01-01T00:00:00Z",
		"region":"us-east-1","open_tracking":false,"click_tracking":true,"tracking_subdomain":null,
		"capabilities":{"sending":"enabled","receiving":"disabled"},
		"records":[{"record":"DKIM","name":"a._domainkey","type":"CNAME","ttl":"Auto","status":"pending","value":"a.dkim.amazonses.com"},
		           {"record":"SPF","name":"send","type":"MX","ttl":"Auto","status":"pending","value":"feedback-smtp.us-east-1.amazonses.com","priority":10}]}`)
	d, err := c.Domains.Create(&CreateDomainRequest{
		Name: "x.dev", Region: "us-east-1", CustomReturnPath: "mail",
		OpenTracking: Ptr(false), ClickTracking: Ptr(true), TrackingSubdomain: "links",
	})
	require.NoError(t, err)
	assert.Equal(t, http.MethodPost, rec.Method)
	assert.Equal(t, "/domains", rec.Path)
	assert.JSONEq(t, `{"name":"x.dev","region":"us-east-1","custom_return_path":"mail","open_tracking":false,"click_tracking":true,"tracking_subdomain":"links"}`, string(rec.Body))
	assert.Equal(t, "d1", d.Id)
	assert.True(t, d.ClickTracking)
	assert.Equal(t, "", d.TrackingSubdomain)
	assert.Equal(t, "enabled", d.Capabilities.Sending)
	require.Len(t, d.Records, 2)
	assert.Equal(t, 10, d.Records[1].Priority)

	_, err = c.Domains.Get("d1")
	require.NoError(t, err)
	assert.Equal(t, http.MethodGet, rec.Method)
	assert.Equal(t, "/domains/d1", rec.Path)

	_, err = c.Domains.Verify("d1")
	require.NoError(t, err)
	assert.Equal(t, http.MethodPost, rec.Method)
	assert.Equal(t, "/domains/d1/verify", rec.Path)

	upd := &UpdateDomainRequest{OpenTracking: Ptr(true)}
	upd.ClearTrackingSubdomain()
	_, err = c.Domains.Update("d1", upd)
	require.NoError(t, err)
	assert.Equal(t, http.MethodPatch, rec.Method)
	assert.JSONEq(t, `{"open_tracking":true,"tracking_subdomain":null}`, string(rec.Body))

	_, err = c.Domains.Update("d1", &UpdateDomainRequest{ClickTracking: Ptr(false), TrackingSubdomain: "go"})
	require.NoError(t, err)
	assert.JSONEq(t, `{"click_tracking":false,"tracking_subdomain":"go"}`, string(rec.Body))

	_, err = c.Domains.Remove("d1")
	require.NoError(t, err)
	assert.Equal(t, http.MethodDelete, rec.Method)
	assert.Equal(t, "/domains/d1", rec.Path)

	c, rec = mockServer(t, 200, `{"object":"list","data":[{"id":"d1","name":"x.dev"}],"has_more":false}`)
	list, err := c.Domains.List(&ListOptions{Before: "cur"})
	require.NoError(t, err)
	assert.Equal(t, "before=cur", rec.RawQuery)
	assert.Equal(t, "x.dev", list.Data[0].Name)
}

func TestWebhooks(t *testing.T) {
	c, rec := mockServer(t, 200, `{"object":"webhook","id":"w1","signing_secret":"whsec_abc"}`)
	created, err := c.Webhooks.Create(&CreateWebhookRequest{
		Endpoint: "https://x.dev/hook", Events: []string{"email.delivered", "email.bounced"}, SigningSecret: "whsec_abc",
	})
	require.NoError(t, err)
	assert.Equal(t, http.MethodPost, rec.Method)
	assert.Equal(t, "/webhooks", rec.Path)
	assert.JSONEq(t, `{"endpoint":"https://x.dev/hook","events":["email.delivered","email.bounced"],"signing_secret":"whsec_abc"}`, string(rec.Body))
	assert.Equal(t, "whsec_abc", created.SigningSecret)

	c, rec = mockServer(t, 200, `{"object":"webhook","id":"w1","endpoint":"https://x.dev/hook","created_at":"2026-01-01T00:00:00Z","status":"enabled","events":["email.sent"],"signing_secret":"whsec_abc","previous_secret_expires_at":null}`)
	got, err := c.Webhooks.Get("w1")
	require.NoError(t, err)
	assert.Equal(t, "/webhooks/w1", rec.Path)
	assert.Equal(t, "whsec_abc", got.SigningSecret)
	assert.Equal(t, []string{"email.sent"}, got.Events)
	assert.Nil(t, got.PreviousSecretExpiresAt)

	c, rec = mockServer(t, 200, `{"object":"webhook","id":"w1","endpoint":"https://x.dev/hook","created_at":"2026-01-01T00:00:00Z","status":"enabled","events":[],"signing_secret":"whsec_new","previous_secret_expires_at":"2026-01-02T00:00:00Z"}`)
	got, err = c.Webhooks.Get("w1")
	require.NoError(t, err)
	assert.Equal(t, "2026-01-02T00:00:00Z", *got.PreviousSecretExpiresAt)

	_, err = c.Webhooks.Update("w1", &UpdateWebhookRequest{Status: "disabled", Events: []string{"email.opened"}})
	require.NoError(t, err)
	assert.Equal(t, http.MethodPatch, rec.Method)
	assert.JSONEq(t, `{"status":"disabled","events":["email.opened"]}`, string(rec.Body))

	_, err = c.Webhooks.Remove("w1")
	require.NoError(t, err)
	assert.Equal(t, http.MethodDelete, rec.Method)
	assert.Equal(t, "/webhooks/w1", rec.Path)

	c, rec = mockServer(t, 200, `{"object":"list","data":[{"id":"w1","events":null}],"has_more":false}`)
	list, err := c.Webhooks.List(nil)
	require.NoError(t, err)
	assert.Equal(t, "/webhooks", rec.Path)
	assert.Nil(t, list.Data[0].Events)
}

func TestWebhooksRotate(t *testing.T) {
	c, rec := mockServer(t, 200, `{"object":"webhook","id":"w1","signing_secret":"whsec_new","previous_secret_expires_at":"2026-01-02T00:00:00Z"}`)
	res, err := c.Webhooks.Rotate("w1", nil)
	require.NoError(t, err)
	assert.Equal(t, http.MethodPost, rec.Method)
	assert.Equal(t, "/webhooks/w1/rotate", rec.Path)
	assert.JSONEq(t, `{}`, string(rec.Body))
	assert.Equal(t, "whsec_new", res.SigningSecret)
	assert.Equal(t, "2026-01-02T00:00:00Z", *res.PreviousSecretExpiresAt)

	_, err = c.Webhooks.Rotate("w1", &RotateWebhookSecretRequest{OverlapHours: Ptr(48)})
	require.NoError(t, err)
	assert.JSONEq(t, `{"overlap_hours":48}`, string(rec.Body))

	// Zero is a real value (drop the old secret at once), not an omission.
	c, rec = mockServer(t, 200, `{"object":"webhook","id":"w1","signing_secret":"whsec_mine","previous_secret_expires_at":null}`)
	res, err = c.Webhooks.Rotate("w1", &RotateWebhookSecretRequest{SigningSecret: "whsec_mine", OverlapHours: Ptr(0)})
	require.NoError(t, err)
	assert.JSONEq(t, `{"signing_secret":"whsec_mine","overlap_hours":0}`, string(rec.Body))
	assert.Nil(t, res.PreviousSecretExpiresAt)
}

func TestApiKeys(t *testing.T) {
	c, rec := mockServer(t, 200, `{"id":"k1","token":"ms_secret"}`)
	created, err := c.ApiKeys.Create(&CreateApiKeyRequest{Name: "ci", Permission: "sending_access", DomainId: "d1"})
	require.NoError(t, err)
	assert.Equal(t, http.MethodPost, rec.Method)
	assert.Equal(t, "/api-keys", rec.Path)
	assert.JSONEq(t, `{"name":"ci","permission":"sending_access","domain_id":"d1"}`, string(rec.Body))
	assert.Equal(t, "ms_secret", created.Token)

	c, rec = mockServer(t, 200, `{"object":"list","data":[{"id":"k1","name":"ci","created_at":"2026-01-01T00:00:00Z","last_used_at":null}],"has_more":false}`)
	list, err := c.ApiKeys.List(&ListOptions{Limit: 2})
	require.NoError(t, err)
	assert.Equal(t, "/api-keys", rec.Path)
	assert.Equal(t, "limit=2", rec.RawQuery)
	assert.Nil(t, list.Data[0].LastUsedAt)

	c, rec = mockServer(t, 200, `{"object":"api_key","id":"k1","deleted":true}`)
	rm, err := c.ApiKeys.Remove("k1")
	require.NoError(t, err)
	assert.Equal(t, http.MethodDelete, rec.Method)
	assert.Equal(t, "/api-keys/k1", rec.Path)
	assert.Equal(t, "k1", rm.Id)
	assert.True(t, rm.Deleted)
}

func TestTemplates(t *testing.T) {
	c, rec := mockServer(t, 200, `{"object":"template","id":"tp1"}`)
	_, err := c.Templates.Create(&CreateTemplateRequest{Name: "Welcome", Html: "<p>{{{NAME}}}</p>", Subject: "Hi", Text: "t", Alias: "welcome"})
	require.NoError(t, err)
	assert.Equal(t, http.MethodPost, rec.Method)
	assert.Equal(t, "/templates", rec.Path)
	assert.JSONEq(t, `{"name":"Welcome","html":"<p>{{{NAME}}}</p>","subject":"Hi","text":"t","alias":"welcome"}`, string(rec.Body))

	upd := &UpdateTemplateRequest{Name: "Welcome v2"}
	upd.ClearAlias()
	upd.ClearSubject()
	_, err = c.Templates.Update("welcome", upd)
	require.NoError(t, err)
	assert.Equal(t, http.MethodPatch, rec.Method)
	assert.Equal(t, "/templates/welcome", rec.Path)
	assert.JSONEq(t, `{"name":"Welcome v2","alias":null,"subject":null}`, string(rec.Body))

	_, err = c.Templates.Publish("tp1")
	require.NoError(t, err)
	assert.Equal(t, http.MethodPost, rec.Method)
	assert.Equal(t, "/templates/tp1/publish", rec.Path)

	_, err = c.Templates.Duplicate("tp1")
	require.NoError(t, err)
	assert.Equal(t, "/templates/tp1/duplicate", rec.Path)

	_, err = c.Templates.Remove("tp1")
	require.NoError(t, err)
	assert.Equal(t, http.MethodDelete, rec.Method)
	assert.Equal(t, "/templates/tp1", rec.Path)

	c, rec = mockServer(t, 200, `{"object":"template","id":"tp1","name":"Welcome","alias":null,"status":"published",
		"published_at":"2026-01-01T00:00:00Z","created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z",
		"current_version_id":"v1","from":null,"subject":"Hi","reply_to":null,"html":"<p>h</p>","text":null,"variables":[],"has_unpublished_versions":false}`)
	got, err := c.Templates.Get("welcome")
	require.NoError(t, err)
	assert.Equal(t, http.MethodGet, rec.Method)
	assert.Equal(t, "/templates/welcome", rec.Path)
	assert.Equal(t, "published", got.Status)
	assert.Equal(t, "", got.Alias)
	assert.Equal(t, "<p>h</p>", got.Html)

	c, rec = mockServer(t, 200, `{"object":"list","data":[{"id":"tp1","name":"Welcome","alias":"welcome"}],"has_more":true}`)
	list, err := c.Templates.List(&ListOptions{After: "cur"})
	require.NoError(t, err)
	assert.Equal(t, "after=cur", rec.RawQuery)
	assert.True(t, list.HasMore)
	assert.Equal(t, "welcome", list.Data[0].Alias)
}

func TestContactProperties(t *testing.T) {
	c, rec := mockServer(t, 200, `{"object":"contact_property","id":"p1","key":"plan","type":"string","fallback_value":"free","created_at":"2026-01-01T00:00:00Z"}`)
	created, err := c.ContactProperties.Create(&CreateContactPropertyRequest{Key: "plan", Type: "string", FallbackValue: "free"})
	require.NoError(t, err)
	assert.Equal(t, http.MethodPost, rec.Method)
	assert.Equal(t, "/contact-properties", rec.Path)
	assert.JSONEq(t, `{"key":"plan","type":"string","fallback_value":"free"}`, string(rec.Body))
	assert.Equal(t, "free", created.FallbackValue)

	_, err = c.ContactProperties.Create(&CreateContactPropertyRequest{Key: "seats", Type: "number"})
	require.NoError(t, err)
	assert.JSONEq(t, `{"key":"seats","type":"number"}`, string(rec.Body))

	_, err = c.ContactProperties.Get("p1")
	require.NoError(t, err)
	assert.Equal(t, http.MethodGet, rec.Method)
	assert.Equal(t, "/contact-properties/p1", rec.Path)

	_, err = c.ContactProperties.Update("p1", &UpdateContactPropertyRequest{FallbackValue: 5})
	require.NoError(t, err)
	assert.Equal(t, http.MethodPatch, rec.Method)
	assert.JSONEq(t, `{"fallback_value":5}`, string(rec.Body))

	// nil clears the fallback: it must reach the wire as null.
	_, err = c.ContactProperties.Update("p1", &UpdateContactPropertyRequest{})
	require.NoError(t, err)
	assert.JSONEq(t, `{"fallback_value":null}`, string(rec.Body))

	_, err = c.ContactProperties.Remove("p1")
	require.NoError(t, err)
	assert.Equal(t, http.MethodDelete, rec.Method)
	assert.Equal(t, "/contact-properties/p1", rec.Path)

	c, rec = mockServer(t, 200, `{"object":"list","data":[{"id":"p1","key":"seats","type":"number","fallback_value":null}],"has_more":false}`)
	list, err := c.ContactProperties.List(nil)
	require.NoError(t, err)
	assert.Equal(t, "/contact-properties", rec.Path)
	assert.Nil(t, list.Data[0].FallbackValue)
}

func TestUsageGet(t *testing.T) {
	c, rec := mockServer(t, 200, `{"object":"usage","cloud":true,"plan":"pro","limits":{"emails_per_day":50000,"domains":10},
		"today":{"emails_sent":1234,"resets_at":"2026-09-05T00:00:00Z"},"team":{"id":"tm1","name":"Acme"},"app_url":"https://app.x.dev"}`)
	u, err := c.Usage.Get()
	require.NoError(t, err)
	assert.Equal(t, http.MethodGet, rec.Method)
	assert.Equal(t, "/usage", rec.Path)
	assert.True(t, u.Cloud)
	assert.Equal(t, "pro", *u.Plan)
	assert.Equal(t, int64(50000), *u.Limits.EmailsPerDay)
	assert.Equal(t, 10, *u.Limits.Domains)
	assert.Equal(t, int64(1234), u.Today.EmailsSent)
	assert.Equal(t, "Acme", u.Team.Name)
	assert.Equal(t, "https://app.x.dev", *u.AppUrl)

	c, _ = mockServer(t, 200, `{"object":"usage","cloud":false,"plan":null,"limits":{"emails_per_day":null,"domains":null},
		"today":{"emails_sent":0,"resets_at":"2026-09-05T00:00:00Z"},"team":{"id":"tm1","name":"Self"},"app_url":null}`)
	u, err = c.Usage.Get()
	require.NoError(t, err)
	assert.Nil(t, u.Plan)
	assert.Nil(t, u.Limits.EmailsPerDay)
	assert.Nil(t, u.AppUrl)
}

// The Clear… helpers never leak into the wire as a field of their own.
func TestClearedRequestsHaveNoStrayKeys(t *testing.T) {
	r := &UpdateTemplateRequest{Html: "<p/>"}
	r.ClearText()
	b, err := json.Marshal(r)
	require.NoError(t, err)
	var m map[string]any
	require.NoError(t, json.Unmarshal(b, &m))
	assert.Equal(t, map[string]any{"html": "<p/>", "text": nil}, m)
}

func TestSegmentsManualFilterAndClear(t *testing.T) {
	c, rec := mockServer(t, 200, `{"object":"segment","id":"s1","name":"Manual","filter":null,"created_at":"2026-01-01T00:00:00Z"}`)
	seg, err := c.Segments.Create(&CreateSegmentRequest{Name: "Manual"})
	require.NoError(t, err)
	assert.Equal(t, http.MethodPost, rec.Method)
	assert.Equal(t, "/segments", rec.Path)
	assert.JSONEq(t, `{"name":"Manual"}`, string(rec.Body))
	assert.Equal(t, SegmentFilter{}, seg.Filter)

	// The value key is required on the wire, presence ops included.
	_, err = c.Segments.Create(&CreateSegmentRequest{Name: "Pro", Filter: SegmentFilter{
		Match:      "all",
		Conditions: []SegmentCondition{{Field: "property:plan", Op: "equals", Value: "pro"}, {Field: "first_name", Op: "is_set"}},
	}})
	require.NoError(t, err)
	assert.JSONEq(t, `{"name":"Pro","filter":{"match":"all","conditions":[
		{"field":"property:plan","op":"equals","value":"pro"},
		{"field":"first_name","op":"is_set","value":""}]}}`, string(rec.Body))

	upd := &UpdateSegmentRequest{Name: "Renamed"}
	upd.ClearFilter()
	_, err = c.Segments.Update("s1", upd)
	require.NoError(t, err)
	assert.Equal(t, http.MethodPatch, rec.Method)
	assert.Equal(t, "/segments/s1", rec.Path)
	assert.JSONEq(t, `{"name":"Renamed","filter":null}`, string(rec.Body))

	_, err = c.Segments.Update("s1", &UpdateSegmentRequest{Filter: &SegmentFilter{Match: "any", Conditions: []SegmentCondition{{Field: "email", Op: "ends_with", Value: "@x.dev"}}}})
	require.NoError(t, err)
	assert.JSONEq(t, `{"filter":{"match":"any","conditions":[{"field":"email","op":"ends_with","value":"@x.dev"}]}}`, string(rec.Body))
}

// Fields the API declares only to answer 422 must still reach the wire.
func TestUnsupportedFieldsPassThrough(t *testing.T) {
	c, rec := mockServer(t, 200, `{"object":"template","id":"tp1"}`)
	_, err := c.Templates.Create(&CreateTemplateRequest{
		Name: "Welcome", Html: "<p>{{{NAME}}}</p>", From: "Acme <a@x.dev>", ReplyTo: []string{"r@x.dev"},
		Variables: []*TemplateVariable{{Key: "NAME", Type: "string", FallbackValue: "there"}},
	})
	require.NoError(t, err)
	assert.JSONEq(t, `{"name":"Welcome","html":"<p>{{{NAME}}}</p>","from":"Acme <a@x.dev>","reply_to":["r@x.dev"],
		"variables":[{"key":"NAME","type":"string","fallback_value":"there"}]}`, string(rec.Body))

	_, err = c.Templates.Update("tp1", &UpdateTemplateRequest{ReplyTo: "r@x.dev", Variables: []*TemplateVariable{{Key: "N", Type: "number"}}})
	require.NoError(t, err)
	assert.JSONEq(t, `{"reply_to":"r@x.dev","variables":[{"key":"N","type":"number"}]}`, string(rec.Body))

	c, rec = mockServer(t, 200, anyOK)
	_, err = c.Domains.Update("d1", &UpdateDomainRequest{Tls: "enforced", OpenTracking: Ptr(true)})
	require.NoError(t, err)
	assert.JSONEq(t, `{"tls":"enforced","open_tracking":true}`, string(rec.Body))
}

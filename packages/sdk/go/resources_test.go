package millionsend

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEmailsGetAndCancel(t *testing.T) {
	c, rec := mockServer(t, 200, `{"object":"email","id":"e1"}`)
	_, err := c.Emails.Get("e1")
	require.NoError(t, err)
	assert.Equal(t, http.MethodGet, rec.Method)
	assert.Equal(t, "/emails/e1", rec.Path)

	_, err = c.Emails.Cancel("e1")
	require.NoError(t, err)
	assert.Equal(t, http.MethodPost, rec.Method)
	assert.Equal(t, "/emails/e1/cancel", rec.Path)
}

func TestEmailsGetScore(t *testing.T) {
	c, _ := mockServer(t, 200, `{"object":"email","id":"e1","score":8.5}`)
	e, err := c.Emails.Get("e1")
	require.NoError(t, err)
	require.NotNil(t, e.Score)
	assert.Equal(t, 8.5, *e.Score)

	c2, _ := mockServer(t, 200, `{"object":"email","id":"e1","score":null}`)
	e, err = c2.Emails.Get("e1")
	require.NoError(t, err)
	assert.Nil(t, e.Score)
}

func TestEmailsGetInsights(t *testing.T) {
	c, rec := mockServer(t, 200, `{
		"object":"email_insights","email_id":"e1","score":8.5,"score_version":1,
		"band":"excellent","marketing":true,"html_size_bytes":12345,
		"computed_at":"2026-08-31T00:00:00Z",
		"checks":[
			{"id":"list_unsubscribe","severity":"critical","status":"fail","penalty":1.25,
			 "detail":{"header":"List-Unsubscribe","found":false}},
			{"id":"plain_text_part","severity":"minor","status":"pass","penalty":0}
		]}`)
	ins, err := c.Emails.GetInsights("e1")
	require.NoError(t, err)
	assert.Equal(t, http.MethodGet, rec.Method)
	assert.Equal(t, "/emails/e1/insights", rec.Path)
	assert.Equal(t, "email_insights", ins.Object)
	assert.Equal(t, "e1", ins.EmailId)
	assert.Equal(t, 8.5, ins.Score)
	assert.Equal(t, 1, ins.ScoreVersion)
	assert.Equal(t, "excellent", ins.Band)
	assert.True(t, ins.Marketing)
	require.NotNil(t, ins.HtmlSizeBytes)
	assert.Equal(t, int64(12345), *ins.HtmlSizeBytes)
	assert.Equal(t, "2026-08-31T00:00:00Z", ins.ComputedAt)
	require.Len(t, ins.Checks, 2)
	assert.Equal(t, "list_unsubscribe", ins.Checks[0].Id)
	assert.Equal(t, "critical", ins.Checks[0].Severity)
	assert.Equal(t, "fail", ins.Checks[0].Status)
	assert.Equal(t, 1.25, ins.Checks[0].Penalty)
	assert.Equal(t, false, ins.Checks[0].Detail["found"])
	assert.Nil(t, ins.Checks[1].Detail)
	assert.Equal(t, float64(0), ins.Checks[1].Penalty)

	// html_size_bytes is nullable.
	c2, _ := mockServer(t, 200, `{"object":"email_insights","email_id":"e1","score":10,"score_version":1,"band":"excellent","marketing":false,"html_size_bytes":null,"computed_at":"2026-08-31T00:00:00Z","checks":[]}`)
	ins, err = c2.Emails.GetInsights("e1")
	require.NoError(t, err)
	assert.Nil(t, ins.HtmlSizeBytes)
}

func TestEmailsGetInsightsNotFound(t *testing.T) {
	c, _ := mockServer(t, 404, `{"statusCode":404,"name":"not_found","message":"Email not found"}`)
	_, err := c.Emails.GetInsights("missing")
	var mse *MillionSendError
	require.ErrorAs(t, err, &mse)
	assert.Equal(t, 404, mse.StatusCode)
	assert.Equal(t, "not_found", mse.Name)
}

// Band/severity/status/guardrail_status are open sets on the wire: a value
// this SDK version has never seen must decode, not error.
func TestInsightsTolerateUnknownEnumValues(t *testing.T) {
	c, _ := mockServer(t, 200, `{"object":"email_insights","email_id":"e1","score":5,"score_version":9,"band":"stellar","marketing":false,"html_size_bytes":null,"computed_at":"2026-08-31T00:00:00Z","checks":[{"id":"brand_new_check","severity":"cosmic","status":"deferred","penalty":0}]}`)
	ins, err := c.Emails.GetInsights("e1")
	require.NoError(t, err)
	assert.Equal(t, "stellar", ins.Band)
	assert.Equal(t, "cosmic", ins.Checks[0].Severity)
	assert.Equal(t, "deferred", ins.Checks[0].Status)

	c2, _ := mockServer(t, 200, `{"object":"deliverability","score":1,"band":"abysmal","content_score":1,"outcome_score":1,"complaint_rate":0,"hard_bounce_rate":0,"emails_sent":1,"scored_recipients":1,"window_days":30,"insufficient_outcome_data":false,"guardrail_status":"quarantined","score_version":9}`)
	d, err := c2.Deliverability.Get()
	require.NoError(t, err)
	assert.Equal(t, "abysmal", *d.Band)
	assert.Equal(t, "quarantined", d.GuardrailStatus)
}

func TestDeliverabilityGet(t *testing.T) {
	c, rec := mockServer(t, 200, `{
		"object":"deliverability","score":8.7,"band":"good",
		"content_score":8.2,"outcome_score":9.1,
		"complaint_rate":0.0002,"hard_bounce_rate":0.001,
		"emails_sent":12345,"scored_recipients":23456,"window_days":30,
		"insufficient_outcome_data":false,"guardrail_status":"ok","score_version":1}`)
	d, err := c.Deliverability.Get()
	require.NoError(t, err)
	assert.Equal(t, http.MethodGet, rec.Method)
	assert.Equal(t, "/deliverability", rec.Path)
	assert.Equal(t, "deliverability", d.Object)
	require.NotNil(t, d.Score)
	assert.Equal(t, 8.7, *d.Score)
	assert.Equal(t, "good", *d.Band)
	assert.Equal(t, 8.2, *d.ContentScore)
	assert.Equal(t, 9.1, *d.OutcomeScore)
	assert.Equal(t, 0.0002, d.ComplaintRate)
	assert.Equal(t, 0.001, d.HardBounceRate)
	assert.Equal(t, int64(12345), d.EmailsSent)
	assert.Equal(t, int64(23456), d.ScoredRecipients)
	assert.Equal(t, 30, d.WindowDays)
	assert.False(t, d.InsufficientOutcomeData)
	assert.Equal(t, "ok", d.GuardrailStatus)
	assert.Equal(t, 1, d.ScoreVersion)
}

func TestDeliverabilityGetNullScores(t *testing.T) {
	c, _ := mockServer(t, 200, `{"object":"deliverability","score":null,"band":null,"content_score":null,"outcome_score":null,"complaint_rate":0,"hard_bounce_rate":0,"emails_sent":0,"scored_recipients":0,"window_days":30,"insufficient_outcome_data":true,"guardrail_status":"ok","score_version":1}`)
	d, err := c.Deliverability.Get()
	require.NoError(t, err)
	assert.Nil(t, d.Score)
	assert.Nil(t, d.Band)
	assert.Nil(t, d.ContentScore)
	assert.Nil(t, d.OutcomeScore)
	assert.True(t, d.InsufficientOutcomeData)
}

func TestBatchSend(t *testing.T) {
	c, rec := mockServer(t, 200, `{"data":[{"id":"1"},{"id":"2"}]}`)
	res, err := c.Batch.Send([]*SendEmailRequest{
		{From: "a@x.dev", To: []string{"b@x.dev"}, Subject: "1", Text: "one"},
		{From: "a@x.dev", To: []string{"c@x.dev"}, Subject: "2", Text: "two"},
	}, WithIdempotencyKey("batch-1"))
	require.NoError(t, err)
	assert.Equal(t, "/emails/batch", rec.Path)
	assert.Equal(t, "batch-1", rec.Header.Get("Idempotency-Key"))
	var arr []any
	require.NoError(t, json.Unmarshal(rec.Body, &arr))
	assert.Len(t, arr, 2)
	assert.Len(t, res.Data, 2)
}

func TestContactsCreate(t *testing.T) {
	c, rec := mockServer(t, 200, `{"object":"contact","id":"c1"}`)
	_, err := c.Contacts.Create(&CreateContactRequest{Email: "c@x.dev", FirstName: "Ada"})
	require.NoError(t, err)
	assert.Equal(t, http.MethodPost, rec.Method)
	assert.Equal(t, "/contacts", rec.Path)
	b := bodyMap(t, rec)
	assert.Equal(t, "c@x.dev", b["email"])
	assert.Equal(t, "Ada", b["first_name"])
}

func TestContactsAddressing(t *testing.T) {
	c, rec := mockServer(t, 200, `{"object":"contact","id":"c1"}`)
	_, err := c.Contacts.Get(ContactAddress{Id: "c1"})
	require.NoError(t, err)
	assert.Equal(t, "/contacts/c1", rec.Path)

	_, err = c.Contacts.Get(ContactAddress{Email: "c@x.dev"})
	require.NoError(t, err)
	assert.Equal(t, "/contacts/c@x.dev", rec.Path)

	// Email wins when both are set.
	_, err = c.Contacts.Get(ContactAddress{Id: "c1", Email: "e@x.dev"})
	require.NoError(t, err)
	assert.Equal(t, "/contacts/e@x.dev", rec.Path)
}

func TestContactsUpdateSendsProvidedFields(t *testing.T) {
	c, rec := mockServer(t, 200, `{"object":"contact","id":"c1"}`)
	_, err := c.Contacts.Update(&UpdateContactRequest{Id: "c1", FirstName: Ptr("Bob"), Unsubscribed: Ptr(true)})
	require.NoError(t, err)
	assert.Equal(t, http.MethodPatch, rec.Method)
	assert.Equal(t, "/contacts/c1", rec.Path)
	b := bodyMap(t, rec)
	assert.Equal(t, "Bob", b["first_name"])
	assert.Equal(t, true, b["unsubscribed"])

	// A nil pointer is omitted; an explicit false is still sent.
	_, err = c.Contacts.Update(&UpdateContactRequest{Email: "c@x.dev", Unsubscribed: Ptr(false)})
	require.NoError(t, err)
	assert.Equal(t, "/contacts/c@x.dev", rec.Path)
	b = bodyMap(t, rec)
	assert.Equal(t, false, b["unsubscribed"])
	_, hasFirst := b["first_name"]
	assert.False(t, hasFirst)
}

func TestContactsRemoveAndList(t *testing.T) {
	c, rec := mockServer(t, 200, `{"object":"list","data":[],"has_more":false}`)
	_, err := c.Contacts.Remove(ContactAddress{Email: "c@x.dev"})
	require.NoError(t, err)
	assert.Equal(t, http.MethodDelete, rec.Method)
	assert.Equal(t, "/contacts/c@x.dev", rec.Path)
	assert.Empty(t, rec.RawQuery)

	_, err = c.Contacts.Remove(ContactAddress{Id: "c1"}, WithErase())
	require.NoError(t, err)
	assert.Equal(t, "/contacts/c1", rec.Path)
	assert.Equal(t, "erase=true", rec.RawQuery)

	_, err = c.Contacts.List(&ListOptions{After: "cur"})
	require.NoError(t, err)
	assert.Equal(t, "/contacts", rec.Path)
	assert.Equal(t, "after=cur", rec.RawQuery)
}

func TestContactsUpdateTopics(t *testing.T) {
	c, rec := mockServer(t, 200, `{"id":"c1"}`)
	_, err := c.Contacts.UpdateTopics(ContactAddress{Id: "c1"}, []ContactTopicUpdate{
		{Id: "t1", Subscription: "opt_out"},
	})
	require.NoError(t, err)
	assert.Equal(t, http.MethodPatch, rec.Method)
	assert.Equal(t, "/contacts/c1/topics", rec.Path)
	var arr []map[string]any
	require.NoError(t, json.Unmarshal(rec.Body, &arr))
	require.Len(t, arr, 1)
	assert.Equal(t, "t1", arr[0]["id"])
	assert.Equal(t, "opt_out", arr[0]["subscription"])
}

func TestContactsTopicsList(t *testing.T) {
	c, rec := mockServer(t, 200, `{"object":"list","has_more":false,"data":[
		{"id":"t1","name":"Insights","description":null,"subscription":"opt_in","explicit":false,"visibility":"public"},
		{"id":"t2","name":"Offers","description":"Deals","subscription":"opt_out","explicit":true,"visibility":"private"}]}`)
	res, err := c.Contacts.Topics.List(ContactAddress{Email: "josé@acme.dev"})
	require.NoError(t, err)
	assert.Equal(t, http.MethodGet, rec.Method)
	assert.Equal(t, "/contacts/jos%C3%A9@acme.dev/topics", rec.RequestURI)
	assert.Equal(t, "/contacts/josé@acme.dev/topics", rec.Path)
	assert.Empty(t, rec.Body)
	assert.Equal(t, "list", res.Object)
	assert.False(t, res.HasMore)
	require.Len(t, res.Data, 2)
	assert.Equal(t, ContactTopic{Id: "t1", Name: "Insights", Subscription: "opt_in", Visibility: "public"}, res.Data[0])
	assert.Equal(t, ContactTopic{Id: "t2", Name: "Offers", Description: "Deals", Subscription: "opt_out", Explicit: true, Visibility: "private"}, res.Data[1])

	_, err = c.Contacts.Topics.List(ContactAddress{Id: "c1"})
	require.NoError(t, err)
	assert.Equal(t, "/contacts/c1/topics", rec.Path)
}

func TestTopicsCRUD(t *testing.T) {
	c, rec := mockServer(t, 200, `{"data":[]}`)
	_, err := c.Topics.Create(&CreateTopicRequest{Name: "Product", DefaultSubscription: "opt_in"})
	require.NoError(t, err)
	assert.Equal(t, "/topics", rec.Path)
	b := bodyMap(t, rec)
	assert.Equal(t, "Product", b["name"])
	assert.Equal(t, "opt_in", b["default_subscription"])

	_, err = c.Topics.Get("t1")
	require.NoError(t, err)
	assert.Equal(t, "/topics/t1", rec.Path)

	_, err = c.Topics.List()
	require.NoError(t, err)
	assert.Equal(t, http.MethodGet, rec.Method)
	assert.Equal(t, "/topics", rec.Path)

	_, err = c.Topics.Remove("t1")
	require.NoError(t, err)
	assert.Equal(t, http.MethodDelete, rec.Method)
}

func TestBroadcastsLifecycle(t *testing.T) {
	c, rec := mockServer(t, 200, `{"id":"b1"}`)
	_, err := c.Broadcasts.Create(&CreateBroadcastRequest{SegmentId: "s1", From: "a@x.dev", Subject: "News", Html: "<p>hi</p>"})
	require.NoError(t, err)
	assert.Equal(t, "/broadcasts", rec.Path)
	b := bodyMap(t, rec)
	assert.Equal(t, "s1", b["segment_id"])
	assert.Equal(t, "News", b["subject"])

	_, err = c.Broadcasts.Get("b1")
	require.NoError(t, err)
	assert.Equal(t, "/broadcasts/b1", rec.Path)

	_, err = c.Broadcasts.List(nil)
	require.NoError(t, err)
	assert.Equal(t, "/broadcasts", rec.Path)
	assert.Empty(t, rec.RawQuery)

	_, err = c.Broadcasts.Update("b1", &UpdateBroadcastRequest{Subject: "New"})
	require.NoError(t, err)
	assert.Equal(t, http.MethodPatch, rec.Method)
	assert.Equal(t, "/broadcasts/b1", rec.Path)

	_, err = c.Broadcasts.Send("b1", &SendBroadcastRequest{ScheduledAt: "2999-01-01T00:00:00Z"})
	require.NoError(t, err)
	assert.Equal(t, "/broadcasts/b1/send", rec.Path)
	assert.Equal(t, "2999-01-01T00:00:00Z", bodyMap(t, rec)["scheduled_at"])

	_, err = c.Broadcasts.Cancel("b1")
	require.NoError(t, err)
	assert.Equal(t, "/broadcasts/b1/cancel", rec.Path)

	_, err = c.Broadcasts.Remove("b1")
	require.NoError(t, err)
	assert.Equal(t, http.MethodDelete, rec.Method)
	assert.Equal(t, "/broadcasts/b1", rec.Path)
}

func TestSegmentsCRUD(t *testing.T) {
	c, rec := mockServer(t, 200, `{"object":"segment","id":"s1"}`)
	filter := SegmentFilter{Match: "all", Conditions: []SegmentCondition{{Field: "email", Op: "is_set"}}}
	_, err := c.Segments.Create(&CreateSegmentRequest{Name: "Active", Filter: filter})
	require.NoError(t, err)
	assert.Equal(t, "/segments", rec.Path)
	b := bodyMap(t, rec)
	assert.Equal(t, "Active", b["name"])
	require.Contains(t, b, "filter")

	_, err = c.Segments.Get("s1")
	require.NoError(t, err)
	assert.Equal(t, "/segments/s1", rec.Path)

	_, err = c.Segments.List(&ListOptions{Before: "cur"})
	require.NoError(t, err)
	assert.Equal(t, "/segments", rec.Path)
	assert.Equal(t, "before=cur", rec.RawQuery)

	_, err = c.Segments.Update("s1", &UpdateSegmentRequest{Name: "Renamed"})
	require.NoError(t, err)
	assert.Equal(t, http.MethodPatch, rec.Method)
	assert.Equal(t, "/segments/s1", rec.Path)

	_, err = c.Segments.Remove("s1")
	require.NoError(t, err)
	assert.Equal(t, http.MethodDelete, rec.Method)
	assert.Equal(t, "/segments/s1", rec.Path)
}

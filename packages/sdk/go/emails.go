package millionsend

import (
	"context"
	"net/http"
	"net/url"
)

// Tag is a key/value label attached to an email.
type Tag struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

// Attachment is a file attached to an email. Content travels base64-encoded
// (encoding/json does that for []byte). Path is sent through unchanged for
// callers porting from Resend; the API accepts inline content only.
type Attachment struct {
	Filename    string `json:"filename"`
	Content     []byte `json:"content,omitempty"`
	ContentType string `json:"content_type,omitempty"`
	ContentId   string `json:"content_id,omitempty"`
	Path        string `json:"path,omitempty"`
}

// EmailTemplate selects a stored template for a send, Resend-style. The API
// does not support it yet: it is sent through so the server answers 422
// instead of the field being dropped silently.
type EmailTemplate struct {
	Id        string         `json:"id"`
	Variables map[string]any `json:"variables,omitempty"`
}

// SendEmailRequest is the payload for Emails.Send and each element of a batch.
// Fields map to the snake_case wire via their json tags; empty optionals are
// omitted.
type SendEmailRequest struct {
	From        string            `json:"from"`
	To          []string          `json:"to"`
	Subject     string            `json:"subject"`
	Html        string            `json:"html,omitempty"`
	Text        string            `json:"text,omitempty"`
	Cc          []string          `json:"cc,omitempty"`
	Bcc         []string          `json:"bcc,omitempty"`
	ReplyTo     string            `json:"reply_to,omitempty"`
	ScheduledAt string            `json:"scheduled_at,omitempty"` // ISO 8601, up to 30 days ahead
	Tags        []Tag             `json:"tags,omitempty"`
	TopicId     string            `json:"topic_id,omitempty"`
	Attachments []*Attachment     `json:"attachments,omitempty"`
	Headers     map[string]string `json:"headers,omitempty"`
	Template    *EmailTemplate    `json:"template,omitempty"`
}

// SendEmailOptions is the resend-go-shaped option struct for
// Emails.SendWithOptions.
type SendEmailOptions struct {
	IdempotencyKey string
}

// SendEmailResponse is the { id } returned by a send.
type SendEmailResponse struct {
	Id string `json:"id"`
}

// UpdateEmailRequest is the payload for Emails.Update: reschedule a not-yet-sent
// email. Id selects the email and is not sent in the body.
type UpdateEmailRequest struct {
	Id          string `json:"-"`
	ScheduledAt string `json:"scheduled_at"`
}

// UpdateEmailResponse is returned by Emails.Update.
type UpdateEmailResponse struct {
	Object string `json:"object"`
	Id     string `json:"id"`
}

// Email is the full record returned by Emails.Get; Emails.List rows carry the
// same fields minus Object, Html, Text, MessageId and Score.
type Email struct {
	Object      string   `json:"object"`
	Id          string   `json:"id"`
	From        string   `json:"from"`
	To          []string `json:"to"`
	Cc          []string `json:"cc"`
	Bcc         []string `json:"bcc"`
	ReplyTo     []string `json:"reply_to"`
	Subject     string   `json:"subject"`
	Html        string   `json:"html"`
	Text        string   `json:"text"`
	CreatedAt   string   `json:"created_at"`
	ScheduledAt string   `json:"scheduled_at"`
	MessageId   string   `json:"message_id"`
	LastEvent   string   `json:"last_event"`
	// Score is the best-practice score (0-10, one decimal); nil when the email
	// has no insights (sent before the feature landed, or never sent).
	Score *float64 `json:"score"`
}

// InsightCheck is one entry of EmailInsights.Checks. Id is an open set (the
// catalog grows across score versions); Severity and Status are plain strings
// so unknown future values never fail decoding.
type InsightCheck struct {
	Id       string         `json:"id"`
	Severity string         `json:"severity"` // "critical" | "major" | "minor" | "info"
	Status   string         `json:"status"`   // "pass" | "fail" | "passed_by_design" | "not_applicable" | "unknown"
	Penalty  float64        `json:"penalty"`  // points deducted; 0 unless status is "fail"
	Detail   map[string]any `json:"detail,omitempty"`
}

// EmailInsights is the pre-send best-practice report returned by
// Emails.GetInsights.
type EmailInsights struct {
	Object        string         `json:"object"`
	EmailId       string         `json:"email_id"`
	Score         float64        `json:"score"` // 0-10, one decimal
	ScoreVersion  int            `json:"score_version"`
	Band          string         `json:"band"` // "excellent" | "good" | "needs_attention" | "at_risk"
	Marketing     bool           `json:"marketing"`
	HtmlSizeBytes *int64         `json:"html_size_bytes"`
	ComputedAt    string         `json:"computed_at"`
	Checks        []InsightCheck `json:"checks"`
}

// CancelEmailResponse is returned by Emails.Cancel.
type CancelEmailResponse struct {
	Object string `json:"object"`
	Id     string `json:"id"`
}

// RemoveEmailResponse is returned by Emails.Remove.
type RemoveEmailResponse struct {
	Object  string `json:"object"`
	Id      string `json:"id"`
	Deleted bool   `json:"deleted"`
}

// BatchSendEmailOptions is the resend-go-shaped option struct for
// Batch.SendWithOptions.
type BatchSendEmailOptions struct {
	IdempotencyKey  string
	BatchValidation BatchValidationMode
}

// BatchSendResponse wraps the ids returned by Batch.Send. Errors is populated
// only in permissive mode, listing the items that were not sent.
type BatchSendResponse struct {
	Data   []SendEmailResponse `json:"data"`
	Errors []BatchError        `json:"errors,omitempty"`
}

// EmailsService covers POST /emails, GET /emails, GET/PATCH/DELETE /emails/:id
// and the cancel action.
type EmailsService struct{ client *Client }

// Send posts a single email. Pass WithIdempotencyKey to make the send idempotent.
func (s *EmailsService) Send(params *SendEmailRequest, opts ...RequestOption) (*SendEmailResponse, error) {
	return s.SendWithContext(context.Background(), params, opts...)
}

// SendWithContext is Send with a caller-supplied context.
func (s *EmailsService) SendWithContext(ctx context.Context, params *SendEmailRequest, opts ...RequestOption) (*SendEmailResponse, error) {
	cfg := buildConfig(opts)
	return doJSON[SendEmailResponse](s.client, ctx, requestParams{
		method:         http.MethodPost,
		path:           "/emails",
		body:           params,
		idempotencyKey: cfg.idempotencyKey,
	})
}

// SendWithOptions is Send in resend-go's shape: options as a struct. nil
// options sends plainly.
func (s *EmailsService) SendWithOptions(ctx context.Context, params *SendEmailRequest, options *SendEmailOptions) (*SendEmailResponse, error) {
	if options == nil {
		options = &SendEmailOptions{}
	}
	return s.SendWithContext(ctx, params, WithIdempotencyKey(options.IdempotencyKey))
}

// Get fetches an email by id.
func (s *EmailsService) Get(id string) (*Email, error) {
	return s.GetWithContext(context.Background(), id)
}

// GetWithContext is Get with a caller-supplied context.
func (s *EmailsService) GetWithContext(ctx context.Context, id string) (*Email, error) {
	return doJSON[Email](s.client, ctx, requestParams{
		method: http.MethodGet,
		path:   "/emails/" + url.PathEscape(id),
	})
}

// List returns sent and scheduled emails, newest first, paginated. Pass nil
// for defaults.
func (s *EmailsService) List(opts *ListOptions) (*ListResponse[Email], error) {
	return s.ListWithContext(context.Background(), opts)
}

// ListWithContext is List with a caller-supplied context.
func (s *EmailsService) ListWithContext(ctx context.Context, opts *ListOptions) (*ListResponse[Email], error) {
	return doJSON[ListResponse[Email]](s.client, ctx, requestParams{
		method: http.MethodGet,
		path:   "/emails",
		query:  opts.values(),
	})
}

// Update reschedules a not-yet-sent email.
func (s *EmailsService) Update(params *UpdateEmailRequest) (*UpdateEmailResponse, error) {
	return s.UpdateWithContext(context.Background(), params)
}

// UpdateWithContext is Update with a caller-supplied context.
func (s *EmailsService) UpdateWithContext(ctx context.Context, params *UpdateEmailRequest) (*UpdateEmailResponse, error) {
	return doJSON[UpdateEmailResponse](s.client, ctx, requestParams{
		method: http.MethodPatch,
		path:   "/emails/" + url.PathEscape(params.Id),
		body:   params,
	})
}

// GetInsights fetches the deliverability insights for an email. The API
// returns a 404 not_found when the id is unknown or insights are not
// available for it yet.
func (s *EmailsService) GetInsights(id string) (*EmailInsights, error) {
	return s.GetInsightsWithContext(context.Background(), id)
}

// GetInsightsWithContext is GetInsights with a caller-supplied context.
func (s *EmailsService) GetInsightsWithContext(ctx context.Context, id string) (*EmailInsights, error) {
	return doJSON[EmailInsights](s.client, ctx, requestParams{
		method: http.MethodGet,
		path:   "/emails/" + url.PathEscape(id) + "/insights",
	})
}

// Cancel cancels a scheduled, unsent email.
func (s *EmailsService) Cancel(id string) (*CancelEmailResponse, error) {
	return s.CancelWithContext(context.Background(), id)
}

// CancelWithContext is Cancel with a caller-supplied context.
func (s *EmailsService) CancelWithContext(ctx context.Context, id string) (*CancelEmailResponse, error) {
	return doJSON[CancelEmailResponse](s.client, ctx, requestParams{
		method: http.MethodPost,
		path:   "/emails/" + url.PathEscape(id) + "/cancel",
	})
}

// Remove deletes an email record and its events.
func (s *EmailsService) Remove(id string) (*RemoveEmailResponse, error) {
	return s.RemoveWithContext(context.Background(), id)
}

// RemoveWithContext is Remove with a caller-supplied context.
func (s *EmailsService) RemoveWithContext(ctx context.Context, id string) (*RemoveEmailResponse, error) {
	return doJSON[RemoveEmailResponse](s.client, ctx, requestParams{
		method: http.MethodDelete,
		path:   "/emails/" + url.PathEscape(id),
	})
}

// BatchService covers POST /emails/batch.
type BatchService struct{ client *Client }

// Send posts 1–100 emails in one call. Pass WithIdempotencyKey to make it
// idempotent and WithBatchValidation(BatchValidationPermissive) to send the
// valid subset when some items are invalid.
func (s *BatchService) Send(params []*SendEmailRequest, opts ...RequestOption) (*BatchSendResponse, error) {
	return s.SendWithContext(context.Background(), params, opts...)
}

// SendWithContext is Send with a caller-supplied context.
func (s *BatchService) SendWithContext(ctx context.Context, params []*SendEmailRequest, opts ...RequestOption) (*BatchSendResponse, error) {
	cfg := buildConfig(opts)
	return doJSON[BatchSendResponse](s.client, ctx, requestParams{
		method:          http.MethodPost,
		path:            "/emails/batch",
		body:            params,
		idempotencyKey:  cfg.idempotencyKey,
		batchValidation: cfg.batchValidation,
	})
}

// SendWithOptions is Send in resend-go's shape: options as a struct. nil
// options sends plainly.
func (s *BatchService) SendWithOptions(ctx context.Context, params []*SendEmailRequest, options *BatchSendEmailOptions) (*BatchSendResponse, error) {
	if options == nil {
		options = &BatchSendEmailOptions{}
	}
	return s.SendWithContext(ctx, params,
		WithIdempotencyKey(options.IdempotencyKey),
		WithBatchValidation(options.BatchValidation),
	)
}

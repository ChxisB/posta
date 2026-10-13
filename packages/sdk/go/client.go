// Package millionsend is the official Go client for the MillionSend API — a
// self-hostable, Resend-compatible email platform.
//
// It deliberately mirrors the shape of resend-go, so migrating is close to a
// find-and-replace: swap the import and constructor. MillionSend Cloud works
// with just the API key; a self-hosted instance also sets Client.BaseURL.
//
//	client := millionsend.NewClient("ms_123")
//	client.BaseURL = "https://mail.acme.dev" // self-hosted only
//	res, err := client.Emails.Send(&millionsend.SendEmailRequest{
//		From:    "Acme <onboarding@acme.dev>",
//		To:      []string{"success@simulator.amazonses.com"},
//		Subject: "Hello",
//		Html:    "<strong>it works</strong>",
//	})
//
// Every method returns (*T, error); on a non-2xx response the error is a
// *MillionSendError carrying the API's { statusCode, name, message }.
package millionsend

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Version is the SDK version, reported in the User-Agent.
const Version = "0.8.0"

const defaultBaseURL = "https://api.millionsend.com"

// Client talks to a MillionSend instance. Construct it with NewClient and reuse
// it; it is safe for concurrent use.
type Client struct {
	// BaseURL is the API origin, MillionSend Cloud by default (a trailing slash
	// is ignored). Exported so it can be overridden after construction,
	// mirroring resend-go.
	BaseURL string
	// HTTPClient performs the requests; defaults to a 30s-timeout client.
	HTTPClient *http.Client
	// UserAgent is sent on every request.
	UserAgent string
	// AllowInsecureHTTP permits a plain http:// BaseURL on a non-loopback host.
	// Off by default because the API key travels as a bearer header.
	AllowInsecureHTTP bool

	apiKey string

	Emails            *EmailsService
	Batch             *BatchService
	Contacts          *ContactsService
	ContactProperties *ContactPropertiesService
	Topics            *TopicsService
	Broadcasts        *BroadcastsService
	Segments          *SegmentsService
	Suppressions      *SuppressionsService
	Domains           *DomainsService
	Webhooks          *WebhooksService
	ApiKeys           *ApiKeysService
	Templates         *TemplatesService
	Deliverability    *DeliverabilityService
	Usage             *UsageService
}

// NewClient returns a Client authenticating with apiKey. If apiKey is empty it
// falls back to MILLIONSEND_API_KEY. BaseURL falls back to MILLIONSEND_BASE_URL,
// then https://api.millionsend.com (MillionSend Cloud).
func NewClient(apiKey string) *Client {
	if apiKey == "" {
		apiKey = os.Getenv("MILLIONSEND_API_KEY")
	}
	baseURL := os.Getenv("MILLIONSEND_BASE_URL")
	if baseURL == "" {
		baseURL = defaultBaseURL
	}
	c := &Client{
		BaseURL:    baseURL,
		HTTPClient: &http.Client{Timeout: 30 * time.Second},
		UserAgent:  "millionsend-go/" + Version,
		apiKey:     apiKey,
	}
	c.Emails = &EmailsService{client: c}
	c.Batch = &BatchService{client: c}
	c.Contacts = &ContactsService{
		client:   c,
		Batch:    &ContactsBatchService{client: c},
		Segments: &ContactSegmentsService{client: c},
		Topics:   &ContactTopicsService{client: c},
	}
	c.ContactProperties = &ContactPropertiesService{client: c}
	c.Topics = &TopicsService{client: c}
	c.Broadcasts = &BroadcastsService{client: c}
	c.Segments = &SegmentsService{client: c}
	c.Suppressions = &SuppressionsService{client: c, Batch: &SuppressionsBatchService{client: c}}
	c.Domains = &DomainsService{client: c}
	c.Webhooks = &WebhooksService{client: c}
	c.ApiKeys = &ApiKeysService{client: c}
	c.Templates = &TemplatesService{client: c}
	c.Deliverability = &DeliverabilityService{client: c}
	c.Usage = &UsageService{client: c}
	return c
}

// String keeps the API key out of %v / %+v output (logs, panics).
func (c Client) String() string {
	return fmt.Sprintf("millionsend.Client{BaseURL:%q UserAgent:%q}", c.BaseURL, c.UserAgent)
}

// GoString keeps the API key out of %#v output.
func (c Client) GoString() string { return c.String() }

// isInsecureHTTPURL reports whether raw is an http:// URL on a non-loopback
// host. Unparseable URLs are left for the transport to reject.
func isInsecureHTTPURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "http" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	return host != "localhost" && host != "::1" && !strings.HasPrefix(host, "127.")
}

// BatchValidationMode is the x-batch-validation switch of the batch endpoints
// (Batch.Send, Contacts.Batch.Create).
type BatchValidationMode string

const (
	// BatchValidationStrict (the default) rejects the whole batch when any item
	// is invalid, writing nothing.
	BatchValidationStrict BatchValidationMode = "strict"
	// BatchValidationPermissive processes the valid items and lists the failed
	// ones in the response's Errors.
	BatchValidationPermissive BatchValidationMode = "permissive"
)

// OnConflict decides what Contacts.Batch.Create does with an email that already
// belongs to a contact, and with an email repeated inside the batch.
type OnConflict string

const (
	OnConflictError  OnConflict = "error"
	OnConflictSkip   OnConflict = "skip"
	OnConflictUpsert OnConflict = "upsert"
)

// ContactInclude is a facet Contacts.List, Segments.ListContacts and
// Contacts.Batch.Get attach to each contact via WithInclude (MillionSend
// extension).
type ContactInclude string

const (
	// ContactIncludeProperties fills ContactListItem.Properties.
	ContactIncludeProperties ContactInclude = "properties"
	// ContactIncludeTopics fills ContactListItem.Topics.
	ContactIncludeTopics ContactInclude = "topics"
)

// RequestOption configures a single request. Emails.Send, Batch.Send,
// Contacts.Batch.Create and Contacts.Batch.Get take them; Contacts.List and
// Segments.ListContacts take WithInclude; Contacts.Remove takes WithErase.
type RequestOption func(*requestConfig)

type requestConfig struct {
	idempotencyKey  string
	batchValidation BatchValidationMode
	onConflict      OnConflict
	include         []ContactInclude
	erase           bool
}

// WithIdempotencyKey attaches an Idempotency-Key header to a send.
func WithIdempotencyKey(key string) RequestOption {
	return func(c *requestConfig) { c.idempotencyKey = key }
}

// WithBatchValidation sets the x-batch-validation header on a batch call.
func WithBatchValidation(mode BatchValidationMode) RequestOption {
	return func(c *requestConfig) { c.batchValidation = mode }
}

// WithOnConflict sets the on_conflict query of Contacts.Batch.Create.
func WithOnConflict(mode OnConflict) RequestOption {
	return func(c *requestConfig) { c.onConflict = mode }
}

// WithInclude attaches the given facets to every contact returned by
// Contacts.List and Segments.ListContacts (the include query) and by
// Contacts.Batch.Get (the include body field).
func WithInclude(facets ...ContactInclude) RequestOption {
	return func(c *requestConfig) { c.include = facets }
}

// WithErase sets the erase query of Contacts.Remove: the address is also
// scrubbed from email history, event payloads and API logs (a GDPR/LGPD
// erasure). Without it a delete keeps the contact's emails in the send log.
// Contacts.Batch.Remove takes the same flag as BatchRemoveContactsRequest.Erase.
func WithErase() RequestOption {
	return func(c *requestConfig) { c.erase = true }
}

func buildConfig(opts []RequestOption) requestConfig {
	var cfg requestConfig
	for _, o := range opts {
		o(&cfg)
	}
	return cfg
}

// ListOptions holds the keyset pagination params shared by every list endpoint.
// After and Before are mutually exclusive; a zero Limit uses the API default.
type ListOptions struct {
	Limit  int
	After  string
	Before string
}

func (o *ListOptions) values() url.Values {
	if o == nil {
		return nil
	}
	v := url.Values{}
	if o.Limit > 0 {
		v.Set("limit", strconv.Itoa(o.Limit))
	}
	if o.After != "" {
		v.Set("after", o.After)
	}
	if o.Before != "" {
		v.Set("before", o.Before)
	}
	return v
}

// ListResponse is the { object, data, has_more } envelope common to the
// paginated list endpoints.
type ListResponse[T any] struct {
	Object  string `json:"object"`
	Data    []T    `json:"data"`
	HasMore bool   `json:"has_more"`
}

// BatchError is one failed item of a permissive-mode batch (Batch.Send,
// Contacts.Batch.Create), by position in the request array.
type BatchError struct {
	Index   int    `json:"index"`
	Message string `json:"message"`
}

// Ptr returns a pointer to v — handy for the optional *string / *bool fields on
// update requests, e.g. Unsubscribed: millionsend.Ptr(true).
func Ptr[T any](v T) *T { return &v }

// marshalWithNulls marshals v, then writes an explicit JSON null for each key in
// nulls: fields a caller cleared, which omitempty would otherwise drop.
func marshalWithNulls(v any, nulls []string) ([]byte, error) {
	b, err := json.Marshal(v)
	if err != nil || len(nulls) == 0 {
		return b, err
	}
	m := map[string]json.RawMessage{}
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, err
	}
	for _, k := range nulls {
		m[k] = json.RawMessage("null")
	}
	return json.Marshal(m)
}

type requestParams struct {
	method          string
	path            string
	body            any
	query           url.Values
	idempotencyKey  string
	batchValidation BatchValidationMode
}

func (c *Client) do(ctx context.Context, p requestParams, out any) error {
	var bodyReader io.Reader
	hasBody := p.body != nil && p.method != http.MethodGet && p.method != http.MethodDelete
	if hasBody {
		buf, err := json.Marshal(p.body)
		if err != nil {
			return &MillionSendError{Name: "application_error", Message: err.Error()}
		}
		bodyReader = bytes.NewReader(buf)
	}

	base := strings.TrimRight(c.BaseURL, "/")
	if !c.AllowInsecureHTTP && isInsecureHTTPURL(base) {
		return &MillionSendError{
			Name:    "application_error",
			Message: "refusing to send the API key over plain http to " + base + "; use https, or set Client.AllowInsecureHTTP = true",
		}
	}
	u := base + p.path
	if len(p.query) > 0 {
		u += "?" + p.query.Encode()
	}

	req, err := http.NewRequestWithContext(ctx, p.method, u, bodyReader)
	if err != nil {
		return &MillionSendError{Name: "application_error", Message: err.Error()}
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", c.UserAgent)
	if hasBody {
		req.Header.Set("Content-Type", "application/json")
	}
	// Idempotency is POST-only on the wire; ignored on any other method.
	if p.idempotencyKey != "" && p.method == http.MethodPost {
		req.Header.Set("Idempotency-Key", p.idempotencyKey)
	}
	if p.batchValidation != "" {
		req.Header.Set("x-batch-validation", string(p.batchValidation))
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		// Never reached the API: StatusCode stays 0 (the wire's "statusCode: null").
		return &MillionSendError{Name: "application_error", Message: err.Error()}
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return &MillionSendError{Name: "application_error", Message: err.Error()}
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return parseError(data, resp.StatusCode)
	}

	if out != nil && len(data) > 0 {
		if err := json.Unmarshal(data, out); err != nil {
			return &MillionSendError{Name: "application_error", Message: err.Error()}
		}
	}
	return nil
}

// doJSON runs a request and decodes a 2xx body into a fresh *T.
func doJSON[T any](c *Client, ctx context.Context, p requestParams) (*T, error) {
	out := new(T)
	if err := c.do(ctx, p, out); err != nil {
		return nil, err
	}
	return out, nil
}

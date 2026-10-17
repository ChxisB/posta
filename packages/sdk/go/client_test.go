package posta

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type capturedRequest struct {
	Method     string
	Path       string
	RequestURI string
	RawQuery   string
	Header     http.Header
	Body       []byte
}

// mockServer spins up an httptest server that records the last request and
// replies with status/respBody, and returns a Client pointed at it.
func mockServer(t *testing.T, status int, respBody string) (*Client, *capturedRequest) {
	t.Helper()
	captured := &capturedRequest{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		captured.Method = r.Method
		captured.Path = r.URL.Path
		captured.RequestURI = r.RequestURI
		captured.RawQuery = r.URL.RawQuery
		captured.Header = r.Header.Clone()
		captured.Body = body
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = io.WriteString(w, respBody)
	}))
	t.Cleanup(srv.Close)
	c := NewClient("po_test")
	c.BaseURL = srv.URL
	return c, captured
}

// bodyMap decodes the captured request body as a JSON object.
func bodyMap(t *testing.T, rec *capturedRequest) map[string]any {
	t.Helper()
	var m map[string]any
	require.NoError(t, json.Unmarshal(rec.Body, &m))
	return m
}

func sampleEmail() *SendEmailRequest {
	return &SendEmailRequest{From: "a@x.dev", To: []string{"b@x.dev"}, Subject: "s", Text: "t"}
}

func TestNewClientDefaultsBaseURL(t *testing.T) {
	t.Setenv("POSTA_BASE_URL", "")
	c := NewClient("po_test")
	assert.Equal(t, "https://api.posta.example", c.BaseURL)
}

func TestExplicitBaseURLWinsOverEnv(t *testing.T) {
	t.Setenv("POSTA_BASE_URL", "https://mail.example.com")
	c, rec := mockServer(t, 200, `{}`) // mockServer sets BaseURL after NewClient
	_, err := c.Emails.Get("e1")
	require.NoError(t, err)
	assert.Equal(t, "/emails/e1", rec.Path)
}

func TestNewClientEnvFallback(t *testing.T) {
	t.Setenv("POSTA_API_KEY", "po_env")
	t.Setenv("POSTA_BASE_URL", "https://mail.example.com")
	c := NewClient("")
	assert.Equal(t, "https://mail.example.com", c.BaseURL)
}

func TestRefusesNonLoopbackHTTPUnlessAllowed(t *testing.T) {
	c := NewClient("po_test")
	c.BaseURL = "http://mail.example.com"
	_, err := c.Emails.Get("e1")
	var apiErr *PostaError
	require.ErrorAs(t, err, &apiErr)
	assert.Contains(t, apiErr.Message, "AllowInsecureHTTP")

	t.Setenv("POSTA_BASE_URL", "http://mail.example.com")
	_, err = NewClient("po_test").Emails.Get("e1")
	require.ErrorAs(t, err, &apiErr)
	assert.Contains(t, apiErr.Message, "AllowInsecureHTTP")

	// Opted in: the request goes out (and fails at the transport instead).
	c.AllowInsecureHTTP = true
	c.HTTPClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		assert.Equal(t, "http://mail.example.com/emails/e1", r.URL.String())
		return nil, fmt.Errorf("sentinel")
	})}
	_, err = c.Emails.Get("e1")
	require.ErrorAs(t, err, &apiErr)
	assert.Contains(t, apiErr.Message, "sentinel")

	// Loopback http is always fine (mockServer runs on 127.0.0.1).
	lc, _ := mockServer(t, 200, `{}`)
	_, err = lc.Emails.Get("e1")
	require.NoError(t, err)
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestFormattingRedactsAPIKey(t *testing.T) {
	c := NewClient("po_secret_key")
	for _, s := range []string{
		fmt.Sprintf("%v", c), fmt.Sprintf("%+v", c), fmt.Sprintf("%#v", c),
		fmt.Sprintf("%v", *c), fmt.Sprintf("%+v", *c), fmt.Sprintf("%#v", *c),
		fmt.Sprint(c), fmt.Sprint(*c),
	} {
		assert.NotContains(t, s, "po_secret_key")
	}
}

func TestTrailingSlashStripped(t *testing.T) {
	c, rec := mockServer(t, 200, `{}`)
	c.BaseURL = c.BaseURL + "/"
	_, err := c.Emails.Get("e1")
	require.NoError(t, err)
	assert.Equal(t, "/emails/e1", rec.Path)
}

func TestRequestHeaders(t *testing.T) {
	c, rec := mockServer(t, 200, `{"id":"abc"}`)
	_, err := c.Emails.Send(sampleEmail())
	require.NoError(t, err)
	assert.Equal(t, "Bearer po_test", rec.Header.Get("Authorization"))
	assert.Equal(t, "application/json", rec.Header.Get("Accept"))
	assert.Equal(t, "application/json", rec.Header.Get("Content-Type"))
	assert.Contains(t, rec.Header.Get("User-Agent"), "posta-go/")
}

func TestCamelToSnakeMappingOmitsEmpty(t *testing.T) {
	c, rec := mockServer(t, 200, `{"id":"abc"}`)
	_, err := c.Emails.Send(&SendEmailRequest{
		From:        "a@x.dev",
		To:          []string{"b@x.dev"},
		Subject:     "s",
		Html:        "<p>h</p>",
		ReplyTo:     "r@x.dev",
		ScheduledAt: "2999-01-01T00:00:00Z",
	})
	require.NoError(t, err)
	b := bodyMap(t, rec)
	assert.Equal(t, "r@x.dev", b["reply_to"])
	assert.Equal(t, "2999-01-01T00:00:00Z", b["scheduled_at"])
	_, hasText := b["text"]
	assert.False(t, hasText, "empty optional should be omitted")
	_, hasCc := b["cc"]
	assert.False(t, hasCc)
}

func TestIdempotencyKeyPostOnly(t *testing.T) {
	c, rec := mockServer(t, 200, `{"id":"abc"}`)
	_, err := c.Emails.Send(sampleEmail(), WithIdempotencyKey("key-123"))
	require.NoError(t, err)
	assert.Equal(t, "key-123", rec.Header.Get("Idempotency-Key"))

	// A GET carries no idempotency header (it is wired to POST sends only).
	_, err = c.Emails.Get("e1")
	require.NoError(t, err)
	assert.Empty(t, rec.Header.Get("Idempotency-Key"))
}

func TestSuccessDecodes(t *testing.T) {
	c, _ := mockServer(t, 200, `{"id":"abc"}`)
	res, err := c.Emails.Send(sampleEmail())
	require.NoError(t, err)
	assert.Equal(t, "abc", res.Id)
}

func TestErrorParsing(t *testing.T) {
	c, _ := mockServer(t, 422, `{"statusCode":422,"name":"validation_error","message":"bad"}`)
	_, err := c.Emails.Send(sampleEmail())
	require.Error(t, err)
	var apiErr *PostaError
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, 422, apiErr.StatusCode)
	assert.Equal(t, "validation_error", apiErr.Name)
	assert.Equal(t, "bad", apiErr.Message)
}

func TestAllRecipientsSuppressedErrorName(t *testing.T) {
	c, _ := mockServer(t, 422, `{"statusCode":422,"name":"all_recipients_suppressed","message":"All recipients are suppressed"}`)
	_, err := c.Emails.Send(sampleEmail())
	var apiErr *PostaError
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, 422, apiErr.StatusCode)
	assert.Equal(t, "all_recipients_suppressed", apiErr.Name)
	assert.Equal(t, "All recipients are suppressed", apiErr.Message)
}

func TestErrorFallbackForNonCanonicalBody(t *testing.T) {
	c, _ := mockServer(t, 500, `gateway boom`)
	_, err := c.Emails.Get("e1")
	require.Error(t, err)
	var apiErr *PostaError
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, 500, apiErr.StatusCode)
	assert.Equal(t, "application_error", apiErr.Name)
}

func TestTransportErrorHasNullStatus(t *testing.T) {
	c := NewClient("po_test")
	c.BaseURL = "http://127.0.0.1:1" // nothing listening: connection refused
	_, err := c.Emails.Send(sampleEmail())
	require.Error(t, err)
	var apiErr *PostaError
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, 0, apiErr.StatusCode, "transport failures use statusCode null (0)")
}

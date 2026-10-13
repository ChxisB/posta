package millionsend

import (
	"context"
	"net/http"
	"net/url"
)

// CreateWebhookRequest is the payload for Webhooks.Create. Events are names
// like "email.delivered" (see the README for the full set). SigningSecret
// carries over an existing whsec_ secret instead of minting one.
type CreateWebhookRequest struct {
	Endpoint      string   `json:"endpoint"`
	Events        []string `json:"events"`
	SigningSecret string   `json:"signing_secret,omitempty"`
}

// CreateWebhookResponse is returned by Webhooks.Create.
type CreateWebhookResponse struct {
	Object        string `json:"object"`
	Id            string `json:"id"`
	SigningSecret string `json:"signing_secret"`
}

// Webhook is returned by Get (with SigningSecret and PreviousSecretExpiresAt)
// and is a List row (without them). Status is "enabled" or "disabled".
// PreviousSecretExpiresAt is set while a rotation's overlap window is open:
// until then deliveries are also signed with the secret this one replaced.
type Webhook struct {
	Object                  string   `json:"object"`
	Id                      string   `json:"id"`
	Endpoint                string   `json:"endpoint"`
	Events                  []string `json:"events"`
	Status                  string   `json:"status"`
	CreatedAt               string   `json:"created_at"`
	SigningSecret           string   `json:"signing_secret,omitempty"`
	PreviousSecretExpiresAt *string  `json:"previous_secret_expires_at,omitempty"`
}

// RotateWebhookSecretRequest is the payload for Webhooks.Rotate. SigningSecret
// supplies the new whsec_ secret instead of minting one. OverlapHours (0–72,
// default 24) is how long the previous secret keeps signing alongside the new
// one; every delivery in the window carries both signatures. Ptr(0) drops the
// old secret at once.
type RotateWebhookSecretRequest struct {
	SigningSecret string `json:"signing_secret,omitempty"`
	OverlapHours  *int   `json:"overlap_hours,omitempty"`
}

// RotateWebhookSecretResponse is returned by Webhooks.Rotate.
// PreviousSecretExpiresAt is nil when the old secret was dropped at once.
type RotateWebhookSecretResponse struct {
	Object                  string  `json:"object"`
	Id                      string  `json:"id"`
	SigningSecret           string  `json:"signing_secret"`
	PreviousSecretExpiresAt *string `json:"previous_secret_expires_at"`
}

// UpdateWebhookRequest is the payload for Webhooks.Update; empty fields are
// left unchanged.
type UpdateWebhookRequest struct {
	Endpoint string   `json:"endpoint,omitempty"`
	Events   []string `json:"events,omitempty"`
	Status   string   `json:"status,omitempty"`
}

// WebhookId is returned by Webhooks.Update.
type WebhookId struct {
	Object string `json:"object"`
	Id     string `json:"id"`
}

// RemoveWebhookResponse is returned by Webhooks.Remove.
type RemoveWebhookResponse struct {
	Object  string `json:"object"`
	Id      string `json:"id"`
	Deleted bool   `json:"deleted"`
}

// WebhooksService covers /webhooks.
type WebhooksService struct{ client *Client }

// Create registers an endpoint for the given events.
func (s *WebhooksService) Create(params *CreateWebhookRequest) (*CreateWebhookResponse, error) {
	return doJSON[CreateWebhookResponse](s.client, context.Background(), requestParams{
		method: http.MethodPost, path: "/webhooks", body: params,
	})
}

// Get fetches a webhook, including its signing secret.
func (s *WebhooksService) Get(id string) (*Webhook, error) {
	return doJSON[Webhook](s.client, context.Background(), requestParams{
		method: http.MethodGet, path: "/webhooks/" + url.PathEscape(id),
	})
}

// List returns webhooks, paginated. Pass nil for defaults.
func (s *WebhooksService) List(opts *ListOptions) (*ListResponse[Webhook], error) {
	return doJSON[ListResponse[Webhook]](s.client, context.Background(), requestParams{
		method: http.MethodGet, path: "/webhooks", query: opts.values(),
	})
}

// Update changes a webhook's endpoint, events and/or status.
func (s *WebhooksService) Update(id string, params *UpdateWebhookRequest) (*WebhookId, error) {
	return doJSON[WebhookId](s.client, context.Background(), requestParams{
		method: http.MethodPatch, path: "/webhooks/" + url.PathEscape(id), body: params,
	})
}

// Rotate replaces a webhook's signing secret. Pass nil to mint a secret with
// the default overlap window.
func (s *WebhooksService) Rotate(id string, params *RotateWebhookSecretRequest) (*RotateWebhookSecretResponse, error) {
	if params == nil {
		params = &RotateWebhookSecretRequest{}
	}
	return doJSON[RotateWebhookSecretResponse](s.client, context.Background(), requestParams{
		method: http.MethodPost, path: "/webhooks/" + url.PathEscape(id) + "/rotate", body: params,
	})
}

// Remove deletes a webhook.
func (s *WebhooksService) Remove(id string) (*RemoveWebhookResponse, error) {
	return doJSON[RemoveWebhookResponse](s.client, context.Background(), requestParams{
		method: http.MethodDelete, path: "/webhooks/" + url.PathEscape(id),
	})
}

package millionsend

import (
	"context"
	"net/http"
	"net/url"
)

// CreateApiKeyRequest is the payload for ApiKeys.Create. Permission is
// "full_access" (default) or "sending_access"; DomainId restricts a
// sending_access key to one domain.
type CreateApiKeyRequest struct {
	Name       string `json:"name"`
	Permission string `json:"permission,omitempty"`
	DomainId   string `json:"domain_id,omitempty"`
}

// CreateApiKeyResponse is returned by ApiKeys.Create. Token is shown only here.
type CreateApiKeyResponse struct {
	Id    string `json:"id"`
	Token string `json:"token"`
}

// ApiKey is a row from ApiKeys.List (never the token).
type ApiKey struct {
	Id         string  `json:"id"`
	Name       string  `json:"name"`
	CreatedAt  string  `json:"created_at"`
	LastUsedAt *string `json:"last_used_at"`
}

// RemoveApiKeyResponse is returned by ApiKeys.Remove.
type RemoveApiKeyResponse struct {
	Object  string `json:"object"`
	Id      string `json:"id"`
	Deleted bool   `json:"deleted"`
}

// ApiKeysService covers /api-keys.
type ApiKeysService struct{ client *Client }

// Create mints an API key; the token is returned only in this response.
func (s *ApiKeysService) Create(params *CreateApiKeyRequest) (*CreateApiKeyResponse, error) {
	return doJSON[CreateApiKeyResponse](s.client, context.Background(), requestParams{
		method: http.MethodPost, path: "/api-keys", body: params,
	})
}

// List returns the team's API keys, paginated. Pass nil for defaults.
func (s *ApiKeysService) List(opts *ListOptions) (*ListResponse[ApiKey], error) {
	return doJSON[ListResponse[ApiKey]](s.client, context.Background(), requestParams{
		method: http.MethodGet, path: "/api-keys", query: opts.values(),
	})
}

// Remove revokes an API key.
func (s *ApiKeysService) Remove(id string) (*RemoveApiKeyResponse, error) {
	return doJSON[RemoveApiKeyResponse](s.client, context.Background(), requestParams{
		method: http.MethodDelete, path: "/api-keys/" + url.PathEscape(id),
	})
}

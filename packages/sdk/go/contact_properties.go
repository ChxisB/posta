package millionsend

import (
	"context"
	"net/http"
	"net/url"
)

// CreateContactPropertyRequest declares a custom contact property. Type is
// "string" or "number"; FallbackValue (a string or number matching Type) is
// used in merge fields when a contact has no value.
type CreateContactPropertyRequest struct {
	Key           string `json:"key"`
	Type          string `json:"type"`
	FallbackValue any    `json:"fallback_value,omitempty"`
}

// UpdateContactPropertyRequest is the payload for ContactProperties.Update. A
// nil FallbackValue is sent as null, clearing the fallback.
type UpdateContactPropertyRequest struct {
	FallbackValue any `json:"fallback_value"`
}

// ContactProperty is returned by Create and Get and is a List row (rows carry
// no Object). FallbackValue decodes as string, float64 or nil.
type ContactProperty struct {
	Object        string `json:"object"`
	Id            string `json:"id"`
	Key           string `json:"key"`
	Type          string `json:"type"`
	FallbackValue any    `json:"fallback_value"`
	CreatedAt     string `json:"created_at"`
}

// ContactPropertyId is returned by ContactProperties.Update.
type ContactPropertyId struct {
	Object string `json:"object"`
	Id     string `json:"id"`
}

// RemoveContactPropertyResponse is returned by ContactProperties.Remove.
type RemoveContactPropertyResponse struct {
	Object  string `json:"object"`
	Id      string `json:"id"`
	Deleted bool   `json:"deleted"`
}

// ContactPropertiesService covers /contact-properties: the schema of the
// custom properties contacts can carry.
type ContactPropertiesService struct{ client *Client }

// Create declares a property; a duplicate key is a 409.
func (s *ContactPropertiesService) Create(params *CreateContactPropertyRequest) (*ContactProperty, error) {
	return doJSON[ContactProperty](s.client, context.Background(), requestParams{
		method: http.MethodPost, path: "/contact-properties", body: params,
	})
}

// Get fetches a property by id.
func (s *ContactPropertiesService) Get(id string) (*ContactProperty, error) {
	return doJSON[ContactProperty](s.client, context.Background(), requestParams{
		method: http.MethodGet, path: "/contact-properties/" + url.PathEscape(id),
	})
}

// List returns the declared properties, paginated. Pass nil for defaults.
func (s *ContactPropertiesService) List(opts *ListOptions) (*ListResponse[ContactProperty], error) {
	return doJSON[ListResponse[ContactProperty]](s.client, context.Background(), requestParams{
		method: http.MethodGet, path: "/contact-properties", query: opts.values(),
	})
}

// Update changes a property's fallback value (key and type are fixed).
func (s *ContactPropertiesService) Update(id string, params *UpdateContactPropertyRequest) (*ContactPropertyId, error) {
	return doJSON[ContactPropertyId](s.client, context.Background(), requestParams{
		method: http.MethodPatch, path: "/contact-properties/" + url.PathEscape(id), body: params,
	})
}

// Remove deletes a property and its values on every contact.
func (s *ContactPropertiesService) Remove(id string) (*RemoveContactPropertyResponse, error) {
	return doJSON[RemoveContactPropertyResponse](s.client, context.Background(), requestParams{
		method: http.MethodDelete, path: "/contact-properties/" + url.PathEscape(id),
	})
}

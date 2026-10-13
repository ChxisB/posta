package millionsend

import (
	"context"
	"net/http"
	"net/url"
)

// TemplateVariable declares a merge variable of a template, Resend-style.
// Type is "string" or "number".
type TemplateVariable struct {
	Key           string `json:"key"`
	Type          string `json:"type"`
	FallbackValue any    `json:"fallback_value,omitempty"`
}

// CreateTemplateRequest is the payload for Templates.Create. Alias is a
// case-sensitive handle, unique per team, usable in place of the id.
//
// From, ReplyTo and Variables are not supported by the API yet: they are sent
// through so the server answers 422 instead of the value being dropped
// silently. ReplyTo is a string or a []string.
type CreateTemplateRequest struct {
	Name      string              `json:"name"`
	Html      string              `json:"html"`
	Subject   string              `json:"subject,omitempty"`
	Text      string              `json:"text,omitempty"`
	Alias     string              `json:"alias,omitempty"`
	From      string              `json:"from,omitempty"`
	ReplyTo   any                 `json:"reply_to,omitempty"`
	Variables []*TemplateVariable `json:"variables,omitempty"`
}

// UpdateTemplateRequest is the payload for Templates.Update; empty fields are
// left unchanged. ClearSubject/ClearText/ClearAlias send null, erasing the
// value. From, ReplyTo and Variables pass through as on create (422).
type UpdateTemplateRequest struct {
	Name      string              `json:"name,omitempty"`
	Html      string              `json:"html,omitempty"`
	Subject   string              `json:"subject,omitempty"`
	Text      string              `json:"text,omitempty"`
	Alias     string              `json:"alias,omitempty"`
	From      string              `json:"from,omitempty"`
	ReplyTo   any                 `json:"reply_to,omitempty"`
	Variables []*TemplateVariable `json:"variables,omitempty"`

	nulls []string
}

// ClearSubject sends subject as null, erasing it.
func (r *UpdateTemplateRequest) ClearSubject() { r.nulls = append(r.nulls, "subject") }

// ClearText sends text as null, dropping the plain-text part.
func (r *UpdateTemplateRequest) ClearText() { r.nulls = append(r.nulls, "text") }

// ClearAlias sends alias as null, freeing the handle.
func (r *UpdateTemplateRequest) ClearAlias() { r.nulls = append(r.nulls, "alias") }

// MarshalJSON adds the cleared fields as explicit nulls.
func (r UpdateTemplateRequest) MarshalJSON() ([]byte, error) {
	type plain UpdateTemplateRequest
	return marshalWithNulls(plain(r), r.nulls)
}

// TemplateId is returned by Create, Update, Publish and Duplicate.
type TemplateId struct {
	Object string `json:"object"`
	Id     string `json:"id"`
}

// Template is returned by Get and is a List row (rows carry the metadata
// fields only). Templates have no draft/publish cycle — every save is live —
// so Status is always "published". From, ReplyTo and Variables read as "",
// nil and empty until the API supports them.
type Template struct {
	Object           string              `json:"object"`
	Id               string              `json:"id"`
	Name             string              `json:"name"`
	Alias            string              `json:"alias"`
	Status           string              `json:"status"`
	PublishedAt      string              `json:"published_at"`
	CreatedAt        string              `json:"created_at"`
	UpdatedAt        string              `json:"updated_at"`
	CurrentVersionId string              `json:"current_version_id"`
	From             string              `json:"from"`
	Subject          string              `json:"subject"`
	ReplyTo          any                 `json:"reply_to"`
	Html             string              `json:"html"`
	Text             string              `json:"text"`
	Variables        []*TemplateVariable `json:"variables"`
}

// RemoveTemplateResponse is returned by Templates.Remove.
type RemoveTemplateResponse struct {
	Object  string `json:"object"`
	Id      string `json:"id"`
	Deleted bool   `json:"deleted"`
}

func templatePath(idOrAlias string) string {
	return "/templates/" + url.PathEscape(idOrAlias)
}

// TemplatesService covers /templates. Every method addressing a template takes
// its id or alias.
type TemplatesService struct{ client *Client }

// Create stores a template; it is live immediately.
func (s *TemplatesService) Create(params *CreateTemplateRequest) (*TemplateId, error) {
	return doJSON[TemplateId](s.client, context.Background(), requestParams{
		method: http.MethodPost, path: "/templates", body: params,
	})
}

// Get fetches a template by id or alias.
func (s *TemplatesService) Get(idOrAlias string) (*Template, error) {
	return doJSON[Template](s.client, context.Background(), requestParams{
		method: http.MethodGet, path: templatePath(idOrAlias),
	})
}

// List returns templates, paginated. Pass nil for defaults.
func (s *TemplatesService) List(opts *ListOptions) (*ListResponse[Template], error) {
	return doJSON[ListResponse[Template]](s.client, context.Background(), requestParams{
		method: http.MethodGet, path: "/templates", query: opts.values(),
	})
}

// Update patches a template; the change is live immediately.
func (s *TemplatesService) Update(idOrAlias string, params *UpdateTemplateRequest) (*TemplateId, error) {
	return doJSON[TemplateId](s.client, context.Background(), requestParams{
		method: http.MethodPatch, path: templatePath(idOrAlias), body: params,
	})
}

// Publish is a no-op kept for resend-go compatibility: every save is already live.
func (s *TemplatesService) Publish(idOrAlias string) (*TemplateId, error) {
	return doJSON[TemplateId](s.client, context.Background(), requestParams{
		method: http.MethodPost, path: templatePath(idOrAlias) + "/publish",
	})
}

// Duplicate copies a template as "<name> (copy)" with no alias.
func (s *TemplatesService) Duplicate(idOrAlias string) (*TemplateId, error) {
	return doJSON[TemplateId](s.client, context.Background(), requestParams{
		method: http.MethodPost, path: templatePath(idOrAlias) + "/duplicate",
	})
}

// Remove deletes a template; broadcasts keep their own copy of the content.
func (s *TemplatesService) Remove(idOrAlias string) (*RemoveTemplateResponse, error) {
	return doJSON[RemoveTemplateResponse](s.client, context.Background(), requestParams{
		method: http.MethodDelete, path: templatePath(idOrAlias),
	})
}

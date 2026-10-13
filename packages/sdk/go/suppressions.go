package millionsend

import (
	"context"
	"net/http"
	"net/url"
)

// Suppression origins. "unsubscribe" is a MillionSend addition for retained
// one-click opt-outs.
const (
	SuppressionOriginBounce      = "bounce"
	SuppressionOriginComplaint   = "complaint"
	SuppressionOriginManual      = "manual"
	SuppressionOriginUnsubscribe = "unsubscribe"
)

// AddSuppressionRequest blocks an address. Origin defaults to manual; an
// address already suppressed keeps its entry and origin.
type AddSuppressionRequest struct {
	Email  string `json:"email"`
	Origin string `json:"origin,omitempty"`
}

// AddSuppressionResponse is returned by Suppressions.Add and, per address, by
// Suppressions.Batch.Add.
type AddSuppressionResponse struct {
	Object string `json:"object"`
	Id     string `json:"id"`
}

// Suppression is a blocked address, as returned by Get and as a List row (rows
// carry no Object). SourceId is the email whose bounce/complaint created the
// entry; nil for manual ones. An erased address (GDPR/LGPD) reads "[erased]".
type Suppression struct {
	Object    string  `json:"object"`
	Id        string  `json:"id"`
	Email     string  `json:"email"`
	Origin    string  `json:"origin"`
	SourceId  *string `json:"source_id"`
	CreatedAt string  `json:"created_at"`
}

// ListSuppressionsOptions paginates Suppressions.List and optionally filters
// by Origin.
type ListSuppressionsOptions struct {
	Origin string
	Limit  int
	After  string
	Before string
}

// RemoveSuppressionResponse is returned by Suppressions.Remove and, per row, by
// Suppressions.Batch.Remove.
type RemoveSuppressionResponse struct {
	Object  string `json:"object"`
	Id      string `json:"id"`
	Deleted bool   `json:"deleted"`
}

// BatchAddSuppressionsRequest blocks up to 1000 addresses; duplicates collapse.
type BatchAddSuppressionsRequest struct {
	Emails []string `json:"emails"`
	Origin string   `json:"origin,omitempty"`
}

// BatchAddSuppressionsResponse has one entry per distinct address, in input order.
type BatchAddSuppressionsResponse struct {
	Data []AddSuppressionResponse `json:"data"`
}

// BatchRemoveSuppressionsRequest unblocks by Emails or by Ids (exactly one of
// the two, up to 1000 each).
type BatchRemoveSuppressionsRequest struct {
	Emails []string `json:"emails,omitempty"`
	Ids    []string `json:"ids,omitempty"`
}

// BatchRemoveSuppressionsResponse lists only the rows actually removed.
type BatchRemoveSuppressionsResponse struct {
	Data []RemoveSuppressionResponse `json:"data"`
}

// SuppressionsService covers /suppressions: the team's do-not-send list.
type SuppressionsService struct {
	client *Client

	// Batch covers POST /suppressions/batch/{add,remove}.
	Batch *SuppressionsBatchService
}

// Add blocks an address. Idempotent: re-adding returns the existing id.
func (s *SuppressionsService) Add(params *AddSuppressionRequest) (*AddSuppressionResponse, error) {
	return doJSON[AddSuppressionResponse](s.client, context.Background(), requestParams{
		method: http.MethodPost, path: "/suppressions", body: params,
	})
}

// Get fetches a suppression by id or email address.
func (s *SuppressionsService) Get(idOrEmail string) (*Suppression, error) {
	return doJSON[Suppression](s.client, context.Background(), requestParams{
		method: http.MethodGet, path: "/suppressions/" + url.PathEscape(idOrEmail),
	})
}

// List returns suppressions, paginated and optionally filtered by origin.
// Pass nil for defaults.
func (s *SuppressionsService) List(opts *ListSuppressionsOptions) (*ListResponse[Suppression], error) {
	var query url.Values
	if opts != nil {
		query = (&ListOptions{Limit: opts.Limit, After: opts.After, Before: opts.Before}).values()
		if opts.Origin != "" {
			query.Set("origin", opts.Origin)
		}
	}
	return doJSON[ListResponse[Suppression]](s.client, context.Background(), requestParams{
		method: http.MethodGet, path: "/suppressions", query: query,
	})
}

// Remove unblocks an address, by suppression id or email.
func (s *SuppressionsService) Remove(idOrEmail string) (*RemoveSuppressionResponse, error) {
	return doJSON[RemoveSuppressionResponse](s.client, context.Background(), requestParams{
		method: http.MethodDelete, path: "/suppressions/" + url.PathEscape(idOrEmail),
	})
}

// SuppressionsBatchService covers the bulk suppression endpoints.
type SuppressionsBatchService struct{ client *Client }

// Add blocks up to 1000 addresses in one call.
func (s *SuppressionsBatchService) Add(params *BatchAddSuppressionsRequest) (*BatchAddSuppressionsResponse, error) {
	return s.AddWithContext(context.Background(), params)
}

// AddWithContext is Add with a caller-supplied context.
func (s *SuppressionsBatchService) AddWithContext(ctx context.Context, params *BatchAddSuppressionsRequest) (*BatchAddSuppressionsResponse, error) {
	return doJSON[BatchAddSuppressionsResponse](s.client, ctx, requestParams{
		method: http.MethodPost, path: "/suppressions/batch/add", body: params,
	})
}

// Remove unblocks up to 1000 addresses (by email or by id) in one call.
func (s *SuppressionsBatchService) Remove(params *BatchRemoveSuppressionsRequest) (*BatchRemoveSuppressionsResponse, error) {
	return s.RemoveWithContext(context.Background(), params)
}

// RemoveWithContext is Remove with a caller-supplied context.
func (s *SuppressionsBatchService) RemoveWithContext(ctx context.Context, params *BatchRemoveSuppressionsRequest) (*BatchRemoveSuppressionsResponse, error) {
	return doJSON[BatchRemoveSuppressionsResponse](s.client, ctx, requestParams{
		method: http.MethodPost, path: "/suppressions/batch/remove", body: params,
	})
}

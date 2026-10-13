package millionsend

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
)

// SegmentCondition is one clause of a segment filter. The wire requires the
// value key on every condition; presence ops ("is_set", "is_not_set") ignore
// it, so leave Value empty for those.
type SegmentCondition struct {
	Field string `json:"field"`
	Op    string `json:"op"`
	Value string `json:"value"`
}

// SegmentFilter is the rule set a segment evaluates. Match is "all" or "any".
type SegmentFilter struct {
	Match      string             `json:"match"`
	Conditions []SegmentCondition `json:"conditions"`
}

// CreateSegmentRequest is the payload for Segments.Create. A zero Filter is
// omitted, creating a manual segment whose membership comes only from
// Contacts.Segments.Add and CreateContactRequest.Segments.
type CreateSegmentRequest struct {
	Name   string        `json:"name"`
	Filter SegmentFilter `json:"filter"`
}

// MarshalJSON drops a zero Filter so the API creates a manual segment.
func (r CreateSegmentRequest) MarshalJSON() ([]byte, error) {
	if r.Filter.Match == "" && len(r.Filter.Conditions) == 0 {
		return json.Marshal(struct {
			Name string `json:"name"`
		}{r.Name})
	}
	type plain CreateSegmentRequest
	return json.Marshal(plain(r))
}

// UpdateSegmentRequest is the payload for Segments.Update. ClearFilter sends
// filter as null, turning the segment manual-membership-only.
type UpdateSegmentRequest struct {
	Name   string         `json:"name,omitempty"`
	Filter *SegmentFilter `json:"filter,omitempty"`

	nulls []string
}

// ClearFilter sends filter as null, removing the saved filter.
func (r *UpdateSegmentRequest) ClearFilter() { r.nulls = append(r.nulls, "filter") }

// MarshalJSON adds the cleared fields as explicit nulls.
func (r UpdateSegmentRequest) MarshalJSON() ([]byte, error) {
	type plain UpdateSegmentRequest
	return marshalWithNulls(plain(r), r.nulls)
}

// Segment is returned by Create, Get, List and Update. Get also populates
// ContactCount. A manual segment has a zero Filter.
type Segment struct {
	Object       string        `json:"object"`
	Id           string        `json:"id"`
	Name         string        `json:"name"`
	Filter       SegmentFilter `json:"filter"`
	CreatedAt    string        `json:"created_at"`
	ContactCount int           `json:"contact_count,omitempty"`
}

// RemoveSegmentResponse is returned by Segments.Remove.
type RemoveSegmentResponse struct {
	Object  string `json:"object"`
	Id      string `json:"id"`
	Deleted bool   `json:"deleted"`
}

// SegmentsService covers /segments — a segment is a saved filter over the
// team's contacts.
type SegmentsService struct{ client *Client }

// Create makes a new segment.
func (s *SegmentsService) Create(params *CreateSegmentRequest) (*Segment, error) {
	return doJSON[Segment](s.client, context.Background(), requestParams{
		method: http.MethodPost, path: "/segments", body: params,
	})
}

// Get fetches a segment by id, including a live contact_count.
func (s *SegmentsService) Get(id string) (*Segment, error) {
	return doJSON[Segment](s.client, context.Background(), requestParams{
		method: http.MethodGet, path: "/segments/" + url.PathEscape(id),
	})
}

// List returns segments, paginated. Pass nil for defaults.
func (s *SegmentsService) List(opts *ListOptions) (*ListResponse[Segment], error) {
	return doJSON[ListResponse[Segment]](s.client, context.Background(), requestParams{
		method: http.MethodGet, path: "/segments", query: opts.values(),
	})
}

// Update patches a segment's name and/or filter.
func (s *SegmentsService) Update(id string, params *UpdateSegmentRequest) (*Segment, error) {
	return doJSON[Segment](s.client, context.Background(), requestParams{
		method: http.MethodPatch, path: "/segments/" + url.PathEscape(id), body: params,
	})
}

// Remove deletes a segment by id.
func (s *SegmentsService) Remove(id string) (*RemoveSegmentResponse, error) {
	return doJSON[RemoveSegmentResponse](s.client, context.Background(), requestParams{
		method: http.MethodDelete, path: "/segments/" + url.PathEscape(id),
	})
}

// ListContacts returns the contacts matching a segment, paginated. Pass nil
// for defaults; WithInclude attaches Properties and/or Topics to every item.
func (s *SegmentsService) ListContacts(id string, opts *ListOptions, ropts ...RequestOption) (*ListResponse[ContactListItem], error) {
	return doJSON[ListResponse[ContactListItem]](s.client, context.Background(), requestParams{
		method: http.MethodGet, path: "/segments/" + url.PathEscape(id) + "/contacts", query: contactListQuery(opts, ropts),
	})
}

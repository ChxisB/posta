package millionsend

import (
	"context"
	"net/http"
	"net/url"
)

// CreateDomainRequest is the payload for Domains.Create. Region must match the
// deployment's SES region (omit to use it). Tracking is off unless enabled;
// TrackingSubdomain is the DNS label of the branded tracking host (e.g.
// "links" for links.<domain>).
type CreateDomainRequest struct {
	Name              string `json:"name"`
	Region            string `json:"region,omitempty"`
	CustomReturnPath  string `json:"custom_return_path,omitempty"`
	OpenTracking      *bool  `json:"open_tracking,omitempty"`
	ClickTracking     *bool  `json:"click_tracking,omitempty"`
	TrackingSubdomain string `json:"tracking_subdomain,omitempty"`
}

// UpdateDomainRequest is the payload for Domains.Update. Nil pointers leave a
// setting unchanged; ClearTrackingSubdomain sends null to drop the branded host.
// Tls ("enforced" | "opportunistic") is not supported by the API: it is sent
// through so the server answers 422 instead of a security setting being
// dropped silently.
type UpdateDomainRequest struct {
	OpenTracking      *bool  `json:"open_tracking,omitempty"`
	ClickTracking     *bool  `json:"click_tracking,omitempty"`
	TrackingSubdomain string `json:"tracking_subdomain,omitempty"`
	Tls               string `json:"tls,omitempty"`

	nulls []string
}

// ClearTrackingSubdomain sends tracking_subdomain as null, removing it.
func (r *UpdateDomainRequest) ClearTrackingSubdomain() {
	r.nulls = append(r.nulls, "tracking_subdomain")
}

// MarshalJSON adds the cleared fields as explicit nulls.
func (r UpdateDomainRequest) MarshalJSON() ([]byte, error) {
	type plain UpdateDomainRequest
	return marshalWithNulls(plain(r), r.nulls)
}

// DomainRecord is one DNS record to publish for a domain. Record is "SPF",
// "DKIM" or "Tracking"; Status is per-record verification state.
type DomainRecord struct {
	Record   string `json:"record"`
	Name     string `json:"name"`
	Type     string `json:"type"`
	Ttl      string `json:"ttl"`
	Status   string `json:"status"`
	Value    string `json:"value"`
	Priority int    `json:"priority,omitempty"`
}

// DomainCapabilities reports what the domain may do ("enabled" | "disabled").
type DomainCapabilities struct {
	Sending   string `json:"sending"`
	Receiving string `json:"receiving"`
}

// Domain is returned by Create, Get, Update and Verify, and is a List row
// (rows carry no Object or Records).
type Domain struct {
	Object            string             `json:"object"`
	Id                string             `json:"id"`
	Name              string             `json:"name"`
	Status            string             `json:"status"`
	CreatedAt         string             `json:"created_at"`
	Region            string             `json:"region"`
	OpenTracking      bool               `json:"open_tracking"`
	ClickTracking     bool               `json:"click_tracking"`
	TrackingSubdomain string             `json:"tracking_subdomain"`
	Capabilities      DomainCapabilities `json:"capabilities"`
	Records           []DomainRecord     `json:"records"`
}

// RemoveDomainResponse is returned by Domains.Remove.
type RemoveDomainResponse struct {
	Object  string `json:"object"`
	Id      string `json:"id"`
	Deleted bool   `json:"deleted"`
}

// DomainsService covers /domains: sending identities and their DNS records.
type DomainsService struct{ client *Client }

// Create adds a domain and returns the DNS records to publish.
func (s *DomainsService) Create(params *CreateDomainRequest) (*Domain, error) {
	return doJSON[Domain](s.client, context.Background(), requestParams{
		method: http.MethodPost, path: "/domains", body: params,
	})
}

// Get fetches a domain with its records.
func (s *DomainsService) Get(id string) (*Domain, error) {
	return doJSON[Domain](s.client, context.Background(), requestParams{
		method: http.MethodGet, path: "/domains/" + url.PathEscape(id),
	})
}

// List returns the team's domains, paginated. Pass nil for defaults.
func (s *DomainsService) List(opts *ListOptions) (*ListResponse[Domain], error) {
	return doJSON[ListResponse[Domain]](s.client, context.Background(), requestParams{
		method: http.MethodGet, path: "/domains", query: opts.values(),
	})
}

// Update changes a domain's tracking settings; returns the full domain.
func (s *DomainsService) Update(id string, params *UpdateDomainRequest) (*Domain, error) {
	return doJSON[Domain](s.client, context.Background(), requestParams{
		method: http.MethodPatch, path: "/domains/" + url.PathEscape(id), body: params,
	})
}

// Verify re-checks the DNS records and returns the domain with per-record status.
func (s *DomainsService) Verify(id string) (*Domain, error) {
	return doJSON[Domain](s.client, context.Background(), requestParams{
		method: http.MethodPost, path: "/domains/" + url.PathEscape(id) + "/verify",
	})
}

// Remove deletes a domain.
func (s *DomainsService) Remove(id string) (*RemoveDomainResponse, error) {
	return doJSON[RemoveDomainResponse](s.client, context.Background(), requestParams{
		method: http.MethodDelete, path: "/domains/" + url.PathEscape(id),
	})
}

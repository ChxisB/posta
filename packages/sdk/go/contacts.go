package millionsend

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
)

// ContactAddress identifies a contact by Id or Email (Email wins if both are
// set). Contacts are team-global.
type ContactAddress struct {
	Id    string
	Email string
}

func (a ContactAddress) key() string {
	if a.Email != "" {
		return a.Email
	}
	return a.Id
}

// MarshalJSON writes the entry shape Contacts.Batch.Get posts: {"email": …}
// when Email is set, otherwise {"id": …}.
func (a ContactAddress) MarshalJSON() ([]byte, error) {
	if a.Email != "" {
		return json.Marshal(struct {
			Email string `json:"email"`
		}{a.Email})
	}
	return json.Marshal(struct {
		Id string `json:"id"`
	}{a.Id})
}

// ContactSegmentRef names a segment to add a contact to on creation.
type ContactSegmentRef struct {
	Id string `json:"id"`
}

// CreateContactRequest is the payload for Contacts.Create and each element of
// Contacts.Batch.Create. Contacts are unique per team by email
// (case-insensitive); a duplicate is a 409 validation_error.
type CreateContactRequest struct {
	Email        string               `json:"email"`
	FirstName    string               `json:"first_name,omitempty"`
	LastName     string               `json:"last_name,omitempty"`
	Unsubscribed bool                 `json:"unsubscribed,omitempty"`
	Properties   map[string]any       `json:"properties,omitempty"`
	Segments     []ContactSegmentRef  `json:"segments,omitempty"`
	Topics       []ContactTopicUpdate `json:"topics,omitempty"`
}

// UpdateContactRequest is the payload for Contacts.Update. The addressing
// fields (Id/Email) select the endpoint and are not sent in the body. The body
// fields are pointers so a nil leaves the value unchanged while an explicit
// value (including false or "") is sent; ClearFirstName/ClearLastName send an
// explicit null, erasing the stored value. A nil Properties value removes that
// key.
type UpdateContactRequest struct {
	Id           string         `json:"-"`
	Email        string         `json:"-"`
	FirstName    *string        `json:"first_name,omitempty"`
	LastName     *string        `json:"last_name,omitempty"`
	Unsubscribed *bool          `json:"unsubscribed,omitempty"`
	Properties   map[string]any `json:"properties,omitempty"`

	nulls []string
}

// ClearFirstName sends first_name as null, erasing it.
func (r *UpdateContactRequest) ClearFirstName() { r.nulls = append(r.nulls, "first_name") }

// ClearLastName sends last_name as null, erasing it.
func (r *UpdateContactRequest) ClearLastName() { r.nulls = append(r.nulls, "last_name") }

// MarshalJSON adds the cleared fields as explicit nulls.
func (r UpdateContactRequest) MarshalJSON() ([]byte, error) {
	type plain UpdateContactRequest
	return marshalWithNulls(plain(r), r.nulls)
}

// ContactId is returned by Create and Update.
type ContactId struct {
	Object string `json:"object"`
	Id     string `json:"id"`
}

// ContactPropertyValue is one custom property as returned by Contacts.Get:
// Value is a string or a float64, per Type ("string" | "number").
type ContactPropertyValue struct {
	Type  string `json:"type"`
	Value any    `json:"value"`
}

// Contact is the full record returned by Contacts.Get.
type Contact struct {
	Object       string                          `json:"object"`
	Id           string                          `json:"id"`
	Email        string                          `json:"email"`
	FirstName    string                          `json:"first_name"`
	LastName     string                          `json:"last_name"`
	CreatedAt    string                          `json:"created_at"`
	Unsubscribed bool                            `json:"unsubscribed"`
	Properties   map[string]ContactPropertyValue `json:"properties"`
}

// ContactListItem is a row from Contacts.List and Segments.ListContacts.
type ContactListItem struct {
	Id           string `json:"id"`
	Email        string `json:"email"`
	FirstName    string `json:"first_name"`
	LastName     string `json:"last_name"`
	CreatedAt    string `json:"created_at"`
	Unsubscribed bool   `json:"unsubscribed"`
	// Properties and Topics are present only when the call passed
	// WithInclude(ContactIncludeProperties) / WithInclude(ContactIncludeTopics):
	// the same shapes Contacts.Get and Contacts.Topics.List return.
	Properties map[string]ContactPropertyValue `json:"properties,omitempty"`
	Topics     []ContactTopic                  `json:"topics,omitempty"`
}

// RemoveContactResponse is returned by Contacts.Remove.
type RemoveContactResponse struct {
	Object  string `json:"object"`
	Contact string `json:"contact"`
	Deleted bool   `json:"deleted"`
}

// ContactTopicUpdate opts a contact in or out of a topic. Subscription is
// "opt_in" or "opt_out".
type ContactTopicUpdate struct {
	Id           string `json:"id"`
	Subscription string `json:"subscription"`
}

// UpdateContactTopicsResponse is returned by Contacts.UpdateTopics.
type UpdateContactTopicsResponse struct {
	Id string `json:"id"`
}

// ContactTopic is one row of Contacts.Topics.List. Subscription ("opt_in" |
// "opt_out") is the contact's effective choice: their own when Explicit is
// true, otherwise the topic's default. Visibility is "public" or "private";
// the hosted preference page lists public topics only.
type ContactTopic struct {
	Id           string `json:"id"`
	Name         string `json:"name"`
	Description  string `json:"description"`
	Subscription string `json:"subscription"`
	Explicit     bool   `json:"explicit"`
	Visibility   string `json:"visibility"`
}

// ContactPreferencesLink is returned by Contacts.CreatePreferencesLink. Url is
// the contact's hosted preference page: a signed, contact-scoped capability
// with no expiry, so hand it only to the contact.
type ContactPreferencesLink struct {
	Object  string `json:"object"`
	Contact string `json:"contact"`
	Url     string `json:"url"`
}

// ListContactTopicsResponse is returned by Contacts.Topics.List; a contact's
// topics are unpaginated, so HasMore is always false.
type ListContactTopicsResponse = ListResponse[ContactTopic]

// BatchContactResult is one successful item of Contacts.Batch.Create. Status
// is "created", "updated" (upsert) or "skipped"; Id is the existing contact's
// for the latter two.
type BatchContactResult struct {
	Object string `json:"object"`
	Index  int    `json:"index"`
	Id     string `json:"id"`
	Status string `json:"status"`
}

// BatchContactsCounts are the per-status totals of a batch; they sum to the
// request length.
type BatchContactsCounts struct {
	Created int `json:"created"`
	Updated int `json:"updated"`
	Skipped int `json:"skipped"`
	Failed  int `json:"failed"`
}

// BatchContactsResponse is returned by Contacts.Batch.Create. Errors is
// populated only in permissive mode.
type BatchContactsResponse struct {
	Data   []BatchContactResult `json:"data"`
	Counts BatchContactsCounts  `json:"counts"`
	Errors []BatchError         `json:"errors,omitempty"`
}

// BatchRemoveContactsRequest deletes by Emails or by Ids (exactly one of the
// two, up to 1000 each). Emails match case-insensitively. Erase also scrubs
// each address from email history, event payloads and API logs (a GDPR/LGPD
// erasure); without it the deleted contacts' emails stay in the send log.
type BatchRemoveContactsRequest struct {
	Emails []string `json:"emails,omitempty"`
	Ids    []string `json:"ids,omitempty"`
	Erase  bool     `json:"erase,omitempty"`
}

// BatchRemoveContactsResponse lists only the rows actually deleted; unknown
// ids or addresses are skipped.
type BatchRemoveContactsResponse struct {
	Data []RemoveContactResponse `json:"data"`
}

type batchGetContactsRequest struct {
	Contacts []ContactAddress `json:"contacts"`
	Include  []ContactInclude `json:"include,omitempty"`
}

// BatchGetContact is one contact as Contacts.Batch.Get returns it: the list
// item plus Object ("contact"), with the facets WithInclude asked for.
type BatchGetContact struct {
	ContactListItem
	Object string `json:"object"`
}

// BatchGetMissingContact is a Contacts.Batch.Get entry that matched no
// contact, by its position in the request; Id or Email echoes the entry.
type BatchGetMissingContact struct {
	Index int    `json:"index"`
	Id    string `json:"id,omitempty"`
	Email string `json:"email,omitempty"`
}

// BatchGetContactsResponse is returned by Contacts.Batch.Get: Data holds the
// contacts found, in request order; Missing the entries that matched nobody.
type BatchGetContactsResponse struct {
	Object  string                   `json:"object"`
	Data    []BatchGetContact        `json:"data"`
	Missing []BatchGetMissingContact `json:"missing"`
}

// AddContactSegmentRequest adds the contact (ContactId or Email; Email wins) to
// SegmentId.
type AddContactSegmentRequest struct {
	SegmentId string
	ContactId string
	Email     string
}

// AddContactSegmentResponse is returned by Contacts.Segments.Add.
type AddContactSegmentResponse struct {
	Id string `json:"id"`
}

// RemoveContactSegmentRequest removes the contact (ContactId or Email; Email
// wins) from SegmentId.
type RemoveContactSegmentRequest struct {
	SegmentId string
	ContactId string
	Email     string
}

// RemoveContactSegmentResponse is returned by Contacts.Segments.Remove. Id is
// the contact; AudienceId is the segment (Resend's field name on the wire).
type RemoveContactSegmentResponse struct {
	Id         string `json:"id"`
	AudienceId string `json:"audienceId"`
	Deleted    bool   `json:"deleted"`
}

func contactPath(idOrEmail string) string {
	return "/contacts/" + url.PathEscape(idOrEmail)
}

// contactListQuery is the pagination query plus the include facets of
// WithInclude, shared by Contacts.List and Segments.ListContacts.
func contactListQuery(opts *ListOptions, ropts []RequestOption) url.Values {
	q := opts.values()
	if inc := buildConfig(ropts).include; len(inc) > 0 {
		parts := make([]string, len(inc))
		for i, f := range inc {
			parts[i] = string(f)
		}
		if q == nil {
			q = url.Values{}
		}
		q.Set("include", strings.Join(parts, ","))
	}
	return q
}

// ContactsService covers the team-global /contacts endpoints.
type ContactsService struct {
	client *Client

	// Batch covers POST /contacts/batch, /contacts/batch/get and
	// /contacts/batch/remove.
	Batch *ContactsBatchService
	// Segments covers the contact ↔ segment membership endpoints.
	Segments *ContactSegmentsService
	// Topics covers GET /contacts/{id}/topics.
	Topics *ContactTopicsService
}

// Create adds a contact to the team.
func (s *ContactsService) Create(params *CreateContactRequest) (*ContactId, error) {
	return doJSON[ContactId](s.client, context.Background(), requestParams{
		method: http.MethodPost, path: "/contacts", body: params,
	})
}

// Get fetches a contact by id or email.
func (s *ContactsService) Get(addr ContactAddress) (*Contact, error) {
	return doJSON[Contact](s.client, context.Background(), requestParams{
		method: http.MethodGet, path: contactPath(addr.key()),
	})
}

// Update patches a contact. Nil body fields are left unchanged.
func (s *ContactsService) Update(params *UpdateContactRequest) (*ContactId, error) {
	addr := ContactAddress{Id: params.Id, Email: params.Email}
	return doJSON[ContactId](s.client, context.Background(), requestParams{
		method: http.MethodPatch, path: contactPath(addr.key()), body: params,
	})
}

// Remove deletes a contact by id or email. The contact's emails stay in the
// send log; WithErase also scrubs the address from email history, event
// payloads and API logs.
func (s *ContactsService) Remove(addr ContactAddress, opts ...RequestOption) (*RemoveContactResponse, error) {
	var q url.Values
	if buildConfig(opts).erase {
		q = url.Values{"erase": {"true"}}
	}
	return doJSON[RemoveContactResponse](s.client, context.Background(), requestParams{
		method: http.MethodDelete, path: contactPath(addr.key()), query: q,
	})
}

// List returns the team's contacts, paginated. Pass nil for defaults;
// WithInclude attaches Properties and/or Topics to every item.
func (s *ContactsService) List(opts *ListOptions, ropts ...RequestOption) (*ListResponse[ContactListItem], error) {
	return doJSON[ListResponse[ContactListItem]](s.client, context.Background(), requestParams{
		method: http.MethodGet, path: "/contacts", query: contactListQuery(opts, ropts),
	})
}

// UpdateTopics patches a contact's topic subscriptions with the bare array the
// API expects, at PATCH /contacts/{idOrEmail}/topics.
func (s *ContactsService) UpdateTopics(addr ContactAddress, topics []ContactTopicUpdate) (*UpdateContactTopicsResponse, error) {
	return doJSON[UpdateContactTopicsResponse](s.client, context.Background(), requestParams{
		method: http.MethodPatch, path: contactPath(addr.key()) + "/topics", body: topics,
	})
}

// CreatePreferencesLink mints the contact's hosted preference-center URL, the
// same page the unsubscribe links in their emails open. 422 when the instance
// is not configured to build hosted links.
func (s *ContactsService) CreatePreferencesLink(addr ContactAddress) (*ContactPreferencesLink, error) {
	return doJSON[ContactPreferencesLink](s.client, context.Background(), requestParams{
		method: http.MethodPost, path: contactPath(addr.key()) + "/preferences-link",
	})
}

// ContactsBatchService covers POST /contacts/batch, /contacts/batch/get and
// /contacts/batch/remove (MillionSend extensions: Resend imports contacts via
// CSV only and reads and deletes them one at a time).
type ContactsBatchService struct{ client *Client }

// Create writes 1–1000 contacts in one call. WithOnConflict picks what happens
// to an email that already exists (default error); WithBatchValidation
// (BatchValidationPermissive) writes the valid subset and lists failures in
// Errors instead of rejecting the whole batch.
func (s *ContactsBatchService) Create(params []*CreateContactRequest, opts ...RequestOption) (*BatchContactsResponse, error) {
	return s.CreateWithContext(context.Background(), params, opts...)
}

// CreateWithContext is Create with a caller-supplied context.
func (s *ContactsBatchService) CreateWithContext(ctx context.Context, params []*CreateContactRequest, opts ...RequestOption) (*BatchContactsResponse, error) {
	cfg := buildConfig(opts)
	var query url.Values
	if cfg.onConflict != "" {
		query = url.Values{"on_conflict": {string(cfg.onConflict)}}
	}
	return doJSON[BatchContactsResponse](s.client, ctx, requestParams{
		method:          http.MethodPost,
		path:            "/contacts/batch",
		body:            params,
		query:           query,
		batchValidation: cfg.batchValidation,
	})
}

// Get reads up to 1000 contacts (by id or by email) in one call, in request
// order. Entries that match no contact are listed in Missing instead of
// failing the call; WithInclude attaches Properties and/or Topics to each
// contact. One call counts as one request against the rate limit.
func (s *ContactsBatchService) Get(addrs []ContactAddress, opts ...RequestOption) (*BatchGetContactsResponse, error) {
	return s.GetWithContext(context.Background(), addrs, opts...)
}

// GetWithContext is Get with a caller-supplied context.
func (s *ContactsBatchService) GetWithContext(ctx context.Context, addrs []ContactAddress, opts ...RequestOption) (*BatchGetContactsResponse, error) {
	return doJSON[BatchGetContactsResponse](s.client, ctx, requestParams{
		method: http.MethodPost, path: "/contacts/batch/get",
		body: batchGetContactsRequest{Contacts: addrs, Include: buildConfig(opts).include},
	})
}

// Remove deletes up to 1000 contacts (by email or by id) in one call. Each
// deletion is the same as Contacts.Remove: emails stay in the send log unless
// Erase is set.
func (s *ContactsBatchService) Remove(params *BatchRemoveContactsRequest) (*BatchRemoveContactsResponse, error) {
	return s.RemoveWithContext(context.Background(), params)
}

// RemoveWithContext is Remove with a caller-supplied context.
func (s *ContactsBatchService) RemoveWithContext(ctx context.Context, params *BatchRemoveContactsRequest) (*BatchRemoveContactsResponse, error) {
	return doJSON[BatchRemoveContactsResponse](s.client, ctx, requestParams{
		method: http.MethodPost, path: "/contacts/batch/remove", body: params,
	})
}

// ContactTopicsService covers GET /contacts/{id}/topics.
type ContactTopicsService struct{ client *Client }

// List returns every topic with the contact's effective subscription to it.
func (s *ContactTopicsService) List(addr ContactAddress) (*ListContactTopicsResponse, error) {
	return doJSON[ListContactTopicsResponse](s.client, context.Background(), requestParams{
		method: http.MethodGet, path: contactPath(addr.key()) + "/topics",
	})
}

// ContactSegmentsService covers POST/DELETE /contacts/{id}/segments/{segmentId}.
type ContactSegmentsService struct{ client *Client }

// Add puts a contact into a segment.
func (s *ContactSegmentsService) Add(params *AddContactSegmentRequest) (*AddContactSegmentResponse, error) {
	addr := ContactAddress{Id: params.ContactId, Email: params.Email}
	return doJSON[AddContactSegmentResponse](s.client, context.Background(), requestParams{
		method: http.MethodPost, path: contactPath(addr.key()) + "/segments/" + url.PathEscape(params.SegmentId),
	})
}

// Remove takes a contact out of a segment.
func (s *ContactSegmentsService) Remove(params *RemoveContactSegmentRequest) (*RemoveContactSegmentResponse, error) {
	addr := ContactAddress{Id: params.ContactId, Email: params.Email}
	return doJSON[RemoveContactSegmentResponse](s.client, context.Background(), requestParams{
		method: http.MethodDelete, path: contactPath(addr.key()) + "/segments/" + url.PathEscape(params.SegmentId),
	})
}

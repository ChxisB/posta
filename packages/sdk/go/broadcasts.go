package millionsend

import (
	"context"
	"net/http"
	"net/url"
)

// CreateBroadcastRequest is the payload for Broadcasts.Create. SegmentId and
// TopicId are optional targeting; neither set sends to all the team's contacts.
// Send: true sends (or, with ScheduledAt, schedules) immediately instead of
// saving a draft.
type CreateBroadcastRequest struct {
	Name        string `json:"name,omitempty"`
	SegmentId   string `json:"segment_id,omitempty"`
	From        string `json:"from"`
	Subject     string `json:"subject"`
	Html        string `json:"html,omitempty"`
	Text        string `json:"text,omitempty"`
	ReplyTo     string `json:"reply_to,omitempty"`
	PreviewText string `json:"preview_text,omitempty"`
	TopicId     string `json:"topic_id,omitempty"`
	Send        bool   `json:"send,omitempty"`
	ScheduledAt string `json:"scheduled_at,omitempty"` // requires Send: true
}

// UpdateBroadcastRequest is the payload for Broadcasts.Update (draft only).
// ClearTopicId sends topic_id as null, detaching the topic.
type UpdateBroadcastRequest struct {
	Name        string `json:"name,omitempty"`
	SegmentId   string `json:"segment_id,omitempty"`
	From        string `json:"from,omitempty"`
	Subject     string `json:"subject,omitempty"`
	Html        string `json:"html,omitempty"`
	Text        string `json:"text,omitempty"`
	ReplyTo     string `json:"reply_to,omitempty"`
	PreviewText string `json:"preview_text,omitempty"`
	TopicId     string `json:"topic_id,omitempty"`

	nulls []string
}

// ClearTopicId sends topic_id as null, so the broadcast no longer targets a topic.
func (r *UpdateBroadcastRequest) ClearTopicId() { r.nulls = append(r.nulls, "topic_id") }

// MarshalJSON adds the cleared fields as explicit nulls.
func (r UpdateBroadcastRequest) MarshalJSON() ([]byte, error) {
	type plain UpdateBroadcastRequest
	return marshalWithNulls(plain(r), r.nulls)
}

// SendBroadcastRequest is the payload for Broadcasts.Send. Leave ScheduledAt
// empty to send now.
type SendBroadcastRequest struct {
	ScheduledAt string `json:"scheduled_at,omitempty"`
}

// BroadcastId is returned by Create, Update and Send.
type BroadcastId struct {
	Id string `json:"id"`
}

// BroadcastListItem is a row from Broadcasts.List. SegmentId is the linked
// segment, empty when the broadcast targets all contacts.
type BroadcastListItem struct {
	Id          string `json:"id"`
	Name        string `json:"name"`
	SegmentId   string `json:"segment_id"`
	Status      string `json:"status"`
	CreatedAt   string `json:"created_at"`
	ScheduledAt string `json:"scheduled_at"`
	SentAt      string `json:"sent_at"`
}

// Broadcast is the full record returned by Broadcasts.Get.
type Broadcast struct {
	BroadcastListItem
	Object      string   `json:"object"`
	From        string   `json:"from"`
	Subject     string   `json:"subject"`
	ReplyTo     []string `json:"reply_to"`
	PreviewText string   `json:"preview_text"`
	TopicId     string   `json:"topic_id"`
	Html        string   `json:"html"`
	Text        string   `json:"text"`
}

// CancelBroadcastResponse is returned by Broadcasts.Cancel.
type CancelBroadcastResponse struct {
	Object string `json:"object"`
	Id     string `json:"id"`
}

// RemoveBroadcastResponse is returned by Broadcasts.Remove.
type RemoveBroadcastResponse struct {
	Object  string `json:"object"`
	Id      string `json:"id"`
	Deleted bool   `json:"deleted"`
}

// BroadcastsService covers the /broadcasts lifecycle.
type BroadcastsService struct{ client *Client }

// Create makes a draft broadcast (or sends it right away with Send: true).
func (s *BroadcastsService) Create(params *CreateBroadcastRequest) (*BroadcastId, error) {
	return doJSON[BroadcastId](s.client, context.Background(), requestParams{
		method: http.MethodPost, path: "/broadcasts", body: params,
	})
}

// Get fetches a broadcast by id.
func (s *BroadcastsService) Get(id string) (*Broadcast, error) {
	return doJSON[Broadcast](s.client, context.Background(), requestParams{
		method: http.MethodGet, path: "/broadcasts/" + url.PathEscape(id),
	})
}

// List returns broadcasts, paginated. Pass nil for defaults.
func (s *BroadcastsService) List(opts *ListOptions) (*ListResponse[BroadcastListItem], error) {
	return doJSON[ListResponse[BroadcastListItem]](s.client, context.Background(), requestParams{
		method: http.MethodGet, path: "/broadcasts", query: opts.values(),
	})
}

// Update patches a draft broadcast.
func (s *BroadcastsService) Update(id string, params *UpdateBroadcastRequest) (*BroadcastId, error) {
	return doJSON[BroadcastId](s.client, context.Background(), requestParams{
		method: http.MethodPatch, path: "/broadcasts/" + url.PathEscape(id), body: params,
	})
}

// Remove deletes a draft broadcast.
func (s *BroadcastsService) Remove(id string) (*RemoveBroadcastResponse, error) {
	return doJSON[RemoveBroadcastResponse](s.client, context.Background(), requestParams{
		method: http.MethodDelete, path: "/broadcasts/" + url.PathEscape(id),
	})
}

// Send sends a broadcast now, or schedules it when params.ScheduledAt is set.
// Pass nil to send immediately.
func (s *BroadcastsService) Send(id string, params *SendBroadcastRequest) (*BroadcastId, error) {
	if params == nil {
		params = &SendBroadcastRequest{}
	}
	return doJSON[BroadcastId](s.client, context.Background(), requestParams{
		method: http.MethodPost, path: "/broadcasts/" + url.PathEscape(id) + "/send", body: params,
	})
}

// Cancel cancels a scheduled broadcast.
func (s *BroadcastsService) Cancel(id string) (*CancelBroadcastResponse, error) {
	return doJSON[CancelBroadcastResponse](s.client, context.Background(), requestParams{
		method: http.MethodPost, path: "/broadcasts/" + url.PathEscape(id) + "/cancel",
	})
}

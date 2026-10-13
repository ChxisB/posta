package millionsend

import (
	"context"
	"net/http"
)

// Usage is the plan and quota snapshot returned by Usage.Get. Plan and the
// Limits are nil on a self-hosted instance (or when unlimited).
type Usage struct {
	Object string      `json:"object"`
	Cloud  bool        `json:"cloud"`
	Plan   *string     `json:"plan"` // "free" | "pro" | "scale"; nil self-hosted
	Limits UsageLimits `json:"limits"`
	Today  UsageToday  `json:"today"`
	Team   UsageTeam   `json:"team"`
	AppUrl *string     `json:"app_url"`
}

// UsageLimits are the effective plan limits; nil means unlimited or self-hosted.
type UsageLimits struct {
	EmailsPerDay *int64 `json:"emails_per_day"`
	Domains      *int   `json:"domains"`
}

// UsageToday is the current UTC day's accepted send count and when it resets.
type UsageToday struct {
	EmailsSent int64  `json:"emails_sent"`
	ResetsAt   string `json:"resets_at"`
}

// UsageTeam identifies the team the API key belongs to.
type UsageTeam struct {
	Id   string `json:"id"`
	Name string `json:"name"`
}

// UsageService covers GET /usage (a MillionSend extension).
type UsageService struct{ client *Client }

// Get fetches the plan, limits and today's send count.
func (s *UsageService) Get() (*Usage, error) {
	return s.GetWithContext(context.Background())
}

// GetWithContext is Get with a caller-supplied context.
func (s *UsageService) GetWithContext(ctx context.Context) (*Usage, error) {
	return doJSON[Usage](s.client, ctx, requestParams{
		method: http.MethodGet,
		path:   "/usage",
	})
}

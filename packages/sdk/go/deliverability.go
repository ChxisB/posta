package millionsend

import (
	"context"
	"net/http"
)

// Deliverability is the account-level score over the trailing window returned
// by Deliverability.Get. Scores are 0-10 with one decimal; nil means not
// enough data to compute. GuardrailStatus is a plain string ("ok" | "warning"
// | "paused") so unknown future values never fail decoding.
type Deliverability struct {
	Object                  string   `json:"object"`
	Score                   *float64 `json:"score"`
	Band                    *string  `json:"band"` // "excellent" | "good" | "needs_attention" | "at_risk"
	ContentScore            *float64 `json:"content_score"`
	OutcomeScore            *float64 `json:"outcome_score"`
	ComplaintRate           float64  `json:"complaint_rate"`
	HardBounceRate          float64  `json:"hard_bounce_rate"`
	EmailsSent              int64    `json:"emails_sent"`
	ScoredRecipients        int64    `json:"scored_recipients"`
	WindowDays              int      `json:"window_days"`
	InsufficientOutcomeData bool     `json:"insufficient_outcome_data"`
	GuardrailStatus         string   `json:"guardrail_status"`
	ScoreVersion            int      `json:"score_version"`
}

// DeliverabilityService covers GET /deliverability.
type DeliverabilityService struct{ client *Client }

// Get fetches the account deliverability score.
func (s *DeliverabilityService) Get() (*Deliverability, error) {
	return s.GetWithContext(context.Background())
}

// GetWithContext is Get with a caller-supplied context.
func (s *DeliverabilityService) GetWithContext(ctx context.Context) (*Deliverability, error) {
	return doJSON[Deliverability](s.client, ctx, requestParams{
		method: http.MethodGet,
		path:   "/deliverability",
	})
}

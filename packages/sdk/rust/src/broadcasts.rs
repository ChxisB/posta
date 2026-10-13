use std::sync::Arc;

use serde::Serialize;

use crate::error::{Error, Result};
use crate::http::Config;
use crate::types::{
    list_query, Broadcast, BroadcastId, BroadcastListItem, CancelBroadcastResponse,
    CreateBroadcastOptions, DeleteBroadcastResponse, List, ListOptions, UpdateBroadcastOptions,
};

/// Broadcasts — a one-off email to a segment, a topic's subscribers, or (with
/// neither set) every contact. Mirrors Resend's `broadcasts` resource.
#[derive(Clone)]
pub struct Broadcasts(pub(crate) Arc<Config>);

impl Broadcasts {
    /// `POST /broadcasts`
    pub async fn create(&self, broadcast: &CreateBroadcastOptions) -> Result<BroadcastId> {
        self.0.post(&["broadcasts"], broadcast).await
    }

    /// `GET /broadcasts/:id`
    pub async fn get(&self, id: &str) -> Result<Broadcast> {
        self.0.get(&["broadcasts", id], &[]).await
    }

    /// `GET /broadcasts`
    pub async fn list(&self, options: Option<&ListOptions>) -> Result<List<BroadcastListItem>> {
        self.0.get(&["broadcasts"], &list_query(options)).await
    }

    /// `PATCH /broadcasts/:id` — draft only.
    pub async fn update(&self, id: &str, changes: &UpdateBroadcastOptions) -> Result<BroadcastId> {
        if changes.clear_topic_id {
            let mut body = serde_json::to_value(changes).map_err(Error::Parse)?;
            body["topic_id"] = serde_json::Value::Null;
            return self.0.patch(&["broadcasts", id], &body).await;
        }
        self.0.patch(&["broadcasts", id], changes).await
    }

    /// `DELETE /broadcasts/:id` — draft only.
    pub async fn delete(&self, id: &str) -> Result<DeleteBroadcastResponse> {
        self.0.delete(&["broadcasts", id]).await
    }

    /// `POST /broadcasts/:id/send` — pass `None` to send now, or an ISO 8601
    /// timestamp to schedule.
    pub async fn send(&self, id: &str, scheduled_at: Option<&str>) -> Result<BroadcastId> {
        self.0
            .post(&["broadcasts", id, "send"], &ScheduledAt { scheduled_at })
            .await
    }

    /// `POST /broadcasts/:id/cancel` — scheduled only.
    pub async fn cancel(&self, id: &str) -> Result<CancelBroadcastResponse> {
        self.0.post_empty(&["broadcasts", id, "cancel"]).await
    }
}

#[derive(Serialize)]
struct ScheduledAt<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    scheduled_at: Option<&'a str>,
}

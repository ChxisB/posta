use std::sync::Arc;

use crate::error::Result;
use crate::http::Config;
use crate::types::{
    list_query, CreateWebhookOptions, CreateWebhookResponse, DeleteWebhookResponse, List,
    ListOptions, RotateWebhookOptions, RotateWebhookResponse, UpdateWebhookOptions, Webhook,
    WebhookId,
};

/// Webhook endpoints. Mirrors Resend's `webhooks` resource.
#[derive(Clone)]
pub struct Webhooks(pub(crate) Arc<Config>);

impl Webhooks {
    /// `POST /webhooks` — returns the `signing_secret` to verify payloads with.
    pub async fn create(&self, webhook: &CreateWebhookOptions) -> Result<CreateWebhookResponse> {
        self.0.post(&["webhooks"], webhook).await
    }

    /// `GET /webhooks/:id` — includes `signing_secret` and, while a rotation's
    /// previous secret still signs, `previous_secret_expires_at`.
    pub async fn get(&self, id: &str) -> Result<Webhook> {
        self.0.get(&["webhooks", id], &[]).await
    }

    /// `GET /webhooks` — items carry no `signing_secret`.
    pub async fn list(&self, options: Option<&ListOptions>) -> Result<List<Webhook>> {
        self.0.get(&["webhooks"], &list_query(options)).await
    }

    /// `PATCH /webhooks/:id`
    pub async fn update(&self, id: &str, changes: &UpdateWebhookOptions) -> Result<WebhookId> {
        self.0.patch(&["webhooks", id], changes).await
    }

    /// `DELETE /webhooks/:id`
    pub async fn delete(&self, id: &str) -> Result<DeleteWebhookResponse> {
        self.0.delete(&["webhooks", id]).await
    }

    /// `POST /webhooks/:id/rotate` — mints (or takes) a new `signing_secret`;
    /// the previous one keeps signing for `overlap_hours` (MillionSend
    /// extension). `None` sends `{}`.
    pub async fn rotate(
        &self,
        id: &str,
        options: Option<&RotateWebhookOptions>,
    ) -> Result<RotateWebhookResponse> {
        let options = options.cloned().unwrap_or_default();
        self.0.post(&["webhooks", id, "rotate"], &options).await
    }
}

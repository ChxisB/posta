use std::sync::Arc;

use crate::error::Result;
use crate::http::Config;
use crate::types::{
    list_query, ApiKey, ApiKeyToken, CreateApiKeyOptions, DeleteApiKeyResponse, List, ListOptions,
};

/// API keys. Mirrors Resend's `api_keys` resource.
#[derive(Clone)]
pub struct ApiKeys(pub(crate) Arc<Config>);

impl ApiKeys {
    /// `POST /api-keys` — the returned `token` is shown only once.
    pub async fn create(&self, api_key: &CreateApiKeyOptions) -> Result<ApiKeyToken> {
        self.0.post(&["api-keys"], api_key).await
    }

    /// `GET /api-keys`
    pub async fn list(&self, options: Option<&ListOptions>) -> Result<List<ApiKey>> {
        self.0.get(&["api-keys"], &list_query(options)).await
    }

    /// `DELETE /api-keys/:id`
    pub async fn delete(&self, id: &str) -> Result<DeleteApiKeyResponse> {
        self.0.delete(&["api-keys", id]).await
    }
}

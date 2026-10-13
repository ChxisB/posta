use std::sync::Arc;

use crate::error::Result;
use crate::http::Config;
use crate::types::{
    AddSuppressionOptions, BatchAddSuppressionOptions, BatchAddSuppressionResponse,
    BatchRemoveSuppressionOptions, BatchRemoveSuppressionsResponse, DeleteSuppressionResponse,
    List, ListSuppressionsOptions, Suppression, SuppressionId,
};

/// Suppression list — addresses the team never sends to. Mirrors Resend's
/// `suppressions` resource; entries are addressable by id or email.
#[derive(Clone)]
pub struct Suppressions(pub(crate) Arc<Config>);

impl Suppressions {
    /// `POST /suppressions`
    pub async fn add(&self, suppression: &AddSuppressionOptions) -> Result<SuppressionId> {
        self.0.post(&["suppressions"], suppression).await
    }

    /// `GET /suppressions/:idOrEmail`
    pub async fn get(&self, id_or_email: &str) -> Result<Suppression> {
        self.0.get(&["suppressions", id_or_email], &[]).await
    }

    /// `GET /suppressions`, optionally filtered by `origin`.
    pub async fn list(
        &self,
        options: Option<&ListSuppressionsOptions>,
    ) -> Result<List<Suppression>> {
        let query = options
            .map(ListSuppressionsOptions::to_query)
            .unwrap_or_default();
        self.0.get(&["suppressions"], &query).await
    }

    /// `DELETE /suppressions/:idOrEmail`
    pub async fn remove(&self, id_or_email: &str) -> Result<DeleteSuppressionResponse> {
        self.0.delete(&["suppressions", id_or_email]).await
    }

    /// `POST /suppressions/batch/add` — up to 1000 addresses.
    pub async fn batch_add(
        &self,
        options: &BatchAddSuppressionOptions,
    ) -> Result<BatchAddSuppressionResponse> {
        self.0
            .post(&["suppressions", "batch", "add"], options)
            .await
    }

    /// `POST /suppressions/batch/remove` — by emails or by ids, up to 1000.
    pub async fn batch_remove(
        &self,
        options: &BatchRemoveSuppressionOptions,
    ) -> Result<BatchRemoveSuppressionsResponse> {
        self.0
            .post(&["suppressions", "batch", "remove"], options)
            .await
    }
}

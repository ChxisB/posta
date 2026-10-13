use std::sync::Arc;

use crate::error::Result;
use crate::http::Config;
use crate::types::{
    list_query, CreateDomainOptions, DeleteDomainResponse, Domain, List, ListOptions,
    UpdateDomainOptions,
};

/// Sending domains and their DNS records. Mirrors Resend's `domains` resource.
#[derive(Clone)]
pub struct Domains(pub(crate) Arc<Config>);

impl Domains {
    /// `POST /domains` — returns the DNS `records` to publish.
    pub async fn create(&self, domain: &CreateDomainOptions) -> Result<Domain> {
        self.0.post(&["domains"], domain).await
    }

    /// `GET /domains/:id`
    pub async fn get(&self, id: &str) -> Result<Domain> {
        self.0.get(&["domains", id], &[]).await
    }

    /// `GET /domains` — items carry no `records`.
    pub async fn list(&self, options: Option<&ListOptions>) -> Result<List<Domain>> {
        self.0.get(&["domains"], &list_query(options)).await
    }

    /// `POST /domains/:id/verify` — re-check DNS; returns the refreshed domain.
    pub async fn verify(&self, id: &str) -> Result<Domain> {
        self.0.post_empty(&["domains", id, "verify"]).await
    }

    /// `PATCH /domains/:id` — tracking settings.
    pub async fn update(&self, id: &str, changes: &UpdateDomainOptions) -> Result<Domain> {
        self.0.patch(&["domains", id], changes).await
    }

    /// `DELETE /domains/:id`
    pub async fn delete(&self, id: &str) -> Result<DeleteDomainResponse> {
        self.0.delete(&["domains", id]).await
    }
}

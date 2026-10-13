use std::sync::Arc;

use crate::error::Result;
use crate::http::Config;
use crate::types::{
    list_query, CreateTemplateOptions, DeleteTemplateResponse, List, ListOptions, Template,
    TemplateId, TemplateListItem, UpdateTemplateOptions,
};

/// Reusable email templates, addressable by id or alias. Mirrors Resend's
/// `templates` resource; templates are always published, so `publish` is a
/// compatibility no-op.
#[derive(Clone)]
pub struct Templates(pub(crate) Arc<Config>);

impl Templates {
    /// `POST /templates`
    pub async fn create(&self, template: &CreateTemplateOptions) -> Result<TemplateId> {
        self.0.post(&["templates"], template).await
    }

    /// `GET /templates/:idOrAlias`
    pub async fn get(&self, id_or_alias: &str) -> Result<Template> {
        self.0.get(&["templates", id_or_alias], &[]).await
    }

    /// `GET /templates`
    pub async fn list(&self, options: Option<&ListOptions>) -> Result<List<TemplateListItem>> {
        self.0.get(&["templates"], &list_query(options)).await
    }

    /// `PATCH /templates/:idOrAlias`
    pub async fn update(
        &self,
        id_or_alias: &str,
        changes: &UpdateTemplateOptions,
    ) -> Result<TemplateId> {
        self.0.patch(&["templates", id_or_alias], changes).await
    }

    /// `DELETE /templates/:idOrAlias`
    pub async fn delete(&self, id_or_alias: &str) -> Result<DeleteTemplateResponse> {
        self.0.delete(&["templates", id_or_alias]).await
    }

    /// `POST /templates/:idOrAlias/publish` — kept for Resend compatibility;
    /// MillionSend templates are always published.
    pub async fn publish(&self, id_or_alias: &str) -> Result<TemplateId> {
        self.0
            .post_empty(&["templates", id_or_alias, "publish"])
            .await
    }

    /// `POST /templates/:idOrAlias/duplicate` — a copy with a fresh id and no alias.
    pub async fn duplicate(&self, id_or_alias: &str) -> Result<TemplateId> {
        self.0
            .post_empty(&["templates", id_or_alias, "duplicate"])
            .await
    }
}

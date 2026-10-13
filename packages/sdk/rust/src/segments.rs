use std::sync::Arc;

use crate::error::Result;
use crate::http::Config;
use crate::types::{
    list_query, ContactListItem, CreateSegmentOptions, DeleteSegmentResponse, List,
    ListContactsOptions, ListOptions, Segment, UpdateSegmentOptions,
};

/// Dynamic segments — a saved filter over the team's contacts (MillionSend
/// extension, no Resend equivalent). `get` returns a live `contact_count`.
#[derive(Clone)]
pub struct Segments(pub(crate) Arc<Config>);

impl Segments {
    /// `POST /segments`
    pub async fn create(&self, segment: &CreateSegmentOptions) -> Result<Segment> {
        self.0.post(&["segments"], segment).await
    }

    /// `GET /segments/:id` — includes `contact_count`.
    pub async fn get(&self, id: &str) -> Result<Segment> {
        self.0.get(&["segments", id], &[]).await
    }

    /// `GET /segments`
    pub async fn list(&self, options: Option<&ListOptions>) -> Result<List<Segment>> {
        self.0.get(&["segments"], &list_query(options)).await
    }

    /// `GET /segments/:id/contacts` — the segment's current members; `include`
    /// attaches `properties` and/or `topics` to every item.
    pub async fn list_contacts(
        &self,
        id: &str,
        options: Option<&ListContactsOptions>,
    ) -> Result<List<ContactListItem>> {
        let query = options
            .map(ListContactsOptions::to_query)
            .unwrap_or_default();
        self.0.get(&["segments", id, "contacts"], &query).await
    }

    /// `PATCH /segments/:id`
    pub async fn update(&self, id: &str, changes: &UpdateSegmentOptions) -> Result<Segment> {
        self.0.patch(&["segments", id], changes).await
    }

    /// `DELETE /segments/:id`
    pub async fn delete(&self, id: &str) -> Result<DeleteSegmentResponse> {
        self.0.delete(&["segments", id]).await
    }
}

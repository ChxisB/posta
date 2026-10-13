use std::sync::Arc;

use crate::error::Result;
use crate::http::Config;
use crate::types::{
    CreateTopicOptions, DeleteTopicResponse, Topic, TopicId, TopicList, UpdateTopicOptions,
};

/// Subscription topics — granular unsubscribe categories for a team.
#[derive(Clone)]
pub struct Topics(pub(crate) Arc<Config>);

impl Topics {
    /// `POST /topics`
    pub async fn create(&self, topic: &CreateTopicOptions) -> Result<TopicId> {
        self.0.post(&["topics"], topic).await
    }

    /// `GET /topics/:id`
    pub async fn get(&self, id: &str) -> Result<Topic> {
        self.0.get(&["topics", id], &[]).await
    }

    /// `GET /topics` — every topic in one page.
    pub async fn list(&self) -> Result<TopicList> {
        self.0.get(&["topics"], &[]).await
    }

    /// `PATCH /topics/:id`
    pub async fn update(&self, id: &str, changes: &UpdateTopicOptions) -> Result<TopicId> {
        self.0.patch(&["topics", id], changes).await
    }

    /// `DELETE /topics/:id`
    pub async fn delete(&self, id: &str) -> Result<DeleteTopicResponse> {
        self.0.delete(&["topics", id]).await
    }
}

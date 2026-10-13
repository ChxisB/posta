use std::sync::Arc;

use serde::Serialize;

use crate::error::Result;
use crate::http::Config;
use crate::types::{
    list_query, AddContactSegmentResponse, BatchContactsOptions, BatchContactsResponse,
    BatchGetContactsOptions, BatchGetContactsResponse, BatchRemoveContactsOptions,
    BatchRemoveContactsResponse, BatchValidation, Contact, ContactAddress, ContactId,
    ContactInclude, ContactListItem, ContactPreferencesLink, ContactProperty, ContactPropertyId,
    ContactTopic, ContactTopicUpdate, CreateContactOptions, CreateContactPropertyOptions,
    DeleteContactOptions, DeleteContactPropertyResponse, DeleteContactResponse, List,
    ListContactsOptions, ListOptions, RemoveContactSegmentResponse, UpdateContactOptions,
    UpdateContactPropertyOptions, UpdateContactTopicsResponse,
};

/// Contacts — team-global, addressable by id or email (email wins). Mirrors
/// Resend's `contacts` resource, plus nested `topics`, `segments` and
/// `properties`.
#[derive(Clone)]
pub struct Contacts {
    config: Arc<Config>,
    pub topics: ContactTopics,
    pub segments: ContactSegments,
    pub properties: ContactProperties,
}

impl Contacts {
    pub(crate) fn new(config: Arc<Config>) -> Self {
        Contacts {
            topics: ContactTopics(config.clone()),
            segments: ContactSegments(config.clone()),
            properties: ContactProperties(config.clone()),
            config,
        }
    }

    /// `POST /contacts` — 409 `validation_error` on a duplicate email
    /// (case-insensitive per team).
    pub async fn create(&self, contact: &CreateContactOptions) -> Result<ContactId> {
        self.config.post(&["contacts"], contact).await
    }

    /// `POST /contacts/batch` — 1–1000 contacts in one request (MillionSend
    /// extension). `on_conflict` and `batch_validation` default server-side to
    /// `error` and `strict`.
    pub async fn create_batch(
        &self,
        contacts: &[CreateContactOptions],
        options: Option<&BatchContactsOptions>,
    ) -> Result<BatchContactsResponse> {
        let options = options.cloned().unwrap_or_default();
        let query: Vec<_> = options
            .on_conflict
            .map(|c| ("on_conflict", c.as_str().to_string()))
            .into_iter()
            .collect();
        self.config
            .post_with(
                &["contacts", "batch"],
                &query,
                contacts,
                &[(
                    "x-batch-validation",
                    options.batch_validation.map(BatchValidation::as_str),
                )],
            )
            .await
    }

    /// `GET /contacts/:idOrEmail`
    pub async fn get(&self, address: impl Into<ContactAddress>) -> Result<Contact> {
        let address = address.into();
        self.config.get(&["contacts", address.key()], &[]).await
    }

    /// `PATCH /contacts/:idOrEmail` — `null` clears a field, omitted leaves it.
    pub async fn update(
        &self,
        address: impl Into<ContactAddress>,
        changes: &UpdateContactOptions,
    ) -> Result<ContactId> {
        let address = address.into();
        self.config
            .patch(&["contacts", address.key()], changes)
            .await
    }

    /// `DELETE /contacts/:idOrEmail` — the contact's emails stay in the send
    /// log; `erase` (`?erase=true`) also scrubs the address from email
    /// history, event payloads and API logs.
    pub async fn delete(
        &self,
        address: impl Into<ContactAddress>,
        options: Option<&DeleteContactOptions>,
    ) -> Result<DeleteContactResponse> {
        let address = address.into();
        let query: Vec<_> = options
            .filter(|o| o.erase)
            .map(|_| ("erase", "true".to_string()))
            .into_iter()
            .collect();
        self.config
            .delete_with(&["contacts", address.key()], &query)
            .await
    }

    /// `GET /contacts` — `include` attaches `properties` and/or `topics` to
    /// every item (MillionSend extension).
    pub async fn list(
        &self,
        options: Option<&ListContactsOptions>,
    ) -> Result<List<ContactListItem>> {
        let query = options
            .map(ListContactsOptions::to_query)
            .unwrap_or_default();
        self.config.get(&["contacts"], &query).await
    }

    /// `POST /contacts/batch/get` — up to 1000 contacts by id or email in one
    /// request, returned in request order (MillionSend extension). Entries
    /// that match no contact land in `missing` instead of failing the call.
    pub async fn batch_get(
        &self,
        contacts: &[ContactAddress],
        options: Option<&BatchGetContactsOptions>,
    ) -> Result<BatchGetContactsResponse> {
        let body = BatchGetContactsBody {
            contacts,
            include: options.and_then(|o| o.include.as_deref()),
        };
        self.config.post(&["contacts", "batch", "get"], &body).await
    }

    /// `POST /contacts/batch/remove` — by ids or by emails, up to 1000
    /// (MillionSend extension). Lists only the contacts actually deleted;
    /// `erase` scrubs the addresses like on [`Contacts::delete`].
    pub async fn batch_remove(
        &self,
        contacts: &BatchRemoveContactsOptions,
        options: Option<&DeleteContactOptions>,
    ) -> Result<BatchRemoveContactsResponse> {
        let body = BatchRemoveContactsBody {
            contacts,
            erase: options.is_some_and(|o| o.erase).then_some(true),
        };
        self.config
            .post(&["contacts", "batch", "remove"], &body)
            .await
    }

    /// `POST /contacts/:idOrEmail/preferences-link` — the contact's hosted
    /// preference page (MillionSend extension). 422 when the instance cannot
    /// build hosted links.
    pub async fn preferences_link(
        &self,
        address: impl Into<ContactAddress>,
    ) -> Result<ContactPreferencesLink> {
        let address = address.into();
        self.config
            .post_empty(&["contacts", address.key(), "preferences-link"])
            .await
    }
}

/// Per-contact topic subscriptions: list a contact's effective choices, opt
/// a contact in/out of a topic.
#[derive(Clone)]
pub struct ContactTopics(pub(crate) Arc<Config>);

impl ContactTopics {
    /// `GET /contacts/:idOrEmail/topics` — every topic of the team with the
    /// contact's effective subscription, in one page.
    pub async fn list(&self, address: impl Into<ContactAddress>) -> Result<List<ContactTopic>> {
        let address = address.into();
        self.0
            .get(&["contacts", address.key(), "topics"], &[])
            .await
    }

    /// `PATCH /contacts/:idOrEmail/topics` with a bare array of updates.
    pub async fn update(
        &self,
        address: impl Into<ContactAddress>,
        topics: &[ContactTopicUpdate],
    ) -> Result<UpdateContactTopicsResponse> {
        let address = address.into();
        self.0
            .patch(&["contacts", address.key(), "topics"], topics)
            .await
    }
}

/// Manual segment membership for one contact.
#[derive(Clone)]
pub struct ContactSegments(pub(crate) Arc<Config>);

impl ContactSegments {
    /// `POST /contacts/:idOrEmail/segments/:segmentId`
    pub async fn add(
        &self,
        address: impl Into<ContactAddress>,
        segment_id: &str,
    ) -> Result<AddContactSegmentResponse> {
        let address = address.into();
        self.0
            .post_empty(&["contacts", address.key(), "segments", segment_id])
            .await
    }

    /// `DELETE /contacts/:idOrEmail/segments/:segmentId`
    pub async fn remove(
        &self,
        address: impl Into<ContactAddress>,
        segment_id: &str,
    ) -> Result<RemoveContactSegmentResponse> {
        let address = address.into();
        self.0
            .delete(&["contacts", address.key(), "segments", segment_id])
            .await
    }
}

/// Typed definitions for the keys of `contact.properties`
/// (`/contact-properties`).
#[derive(Clone)]
pub struct ContactProperties(pub(crate) Arc<Config>);

impl ContactProperties {
    /// `POST /contact-properties`
    pub async fn create(&self, property: &CreateContactPropertyOptions) -> Result<ContactProperty> {
        self.0.post(&["contact-properties"], property).await
    }

    /// `GET /contact-properties/:id`
    pub async fn get(&self, id: &str) -> Result<ContactProperty> {
        self.0.get(&["contact-properties", id], &[]).await
    }

    /// `GET /contact-properties`
    pub async fn list(&self, options: Option<&ListOptions>) -> Result<List<ContactProperty>> {
        self.0
            .get(&["contact-properties"], &list_query(options))
            .await
    }

    /// `PATCH /contact-properties/:id`
    pub async fn update(
        &self,
        id: &str,
        changes: &UpdateContactPropertyOptions,
    ) -> Result<ContactPropertyId> {
        self.0.patch(&["contact-properties", id], changes).await
    }

    /// `DELETE /contact-properties/:id`
    pub async fn delete(&self, id: &str) -> Result<DeleteContactPropertyResponse> {
        self.0.delete(&["contact-properties", id]).await
    }
}

#[derive(Serialize)]
struct BatchGetContactsBody<'a> {
    contacts: &'a [ContactAddress],
    #[serde(skip_serializing_if = "Option::is_none")]
    include: Option<&'a [ContactInclude]>,
}

#[derive(Serialize)]
struct BatchRemoveContactsBody<'a> {
    #[serde(flatten)]
    contacts: &'a BatchRemoveContactsOptions,
    #[serde(skip_serializing_if = "Option::is_none")]
    erase: Option<bool>,
}

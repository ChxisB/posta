//! Request and response types. Rust's idiomatic snake_case is already the wire
//! casing, so request structs `#[derive(Serialize)]` straight onto the wire
//! (`Option::None` fields are omitted); responses `#[derive(Deserialize)]` the
//! wire shape verbatim, so `object`/`created_at`/`first_name` read as returned.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// A recipient field that accepts a single address or a list — serializes as a
/// bare string or a JSON array to match the wire's `string | string[]`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Recipients {
    One(String),
    Many(Vec<String>),
}

impl Default for Recipients {
    fn default() -> Self {
        Recipients::Many(Vec::new())
    }
}

impl From<&str> for Recipients {
    fn from(value: &str) -> Self {
        Recipients::One(value.to_string())
    }
}

impl From<String> for Recipients {
    fn from(value: String) -> Self {
        Recipients::One(value)
    }
}

impl From<Vec<String>> for Recipients {
    fn from(value: Vec<String>) -> Self {
        Recipients::Many(value)
    }
}

impl From<Vec<&str>> for Recipients {
    fn from(value: Vec<&str>) -> Self {
        Recipients::Many(value.into_iter().map(String::from).collect())
    }
}

impl<const N: usize> From<[&str; N]> for Recipients {
    fn from(value: [&str; N]) -> Self {
        Recipients::Many(value.iter().map(|s| s.to_string()).collect())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Tag {
    pub name: String,
    pub value: String,
}

// ---- request options shared across resources -----------------------------

/// A request body paired with an optional `Idempotency-Key`. Any body converts
/// implicitly (`ms.emails.send(&email)`); attach a key with
/// [`with_idempotency_key`](IdempotentTrait::with_idempotency_key).
#[derive(Debug, Clone)]
pub struct Idempotent<T> {
    pub data: T,
    pub idempotency_key: Option<String>,
}

impl<T> From<T> for Idempotent<T> {
    fn from(data: T) -> Self {
        Idempotent {
            data,
            idempotency_key: None,
        }
    }
}

impl<'a, T, const N: usize> From<&'a [T; N]> for Idempotent<&'a [T]> {
    fn from(data: &'a [T; N]) -> Self {
        Idempotent::from(data.as_slice())
    }
}

impl<'a, T> From<&'a Vec<T>> for Idempotent<&'a [T]> {
    fn from(data: &'a Vec<T>) -> Self {
        Idempotent::from(data.as_slice())
    }
}

/// Resend's idempotency shape: `ms.emails.send(email.with_idempotency_key("k"))`
/// and `ms.batch.send(emails.with_idempotency_key("k"))`.
pub trait IdempotentTrait: Sized {
    fn with_idempotency_key(self, key: impl Into<String>) -> Idempotent<Self> {
        Idempotent {
            data: self,
            idempotency_key: Some(key.into()),
        }
    }
}

impl IdempotentTrait for &SendEmailOptions {}
impl IdempotentTrait for &[SendEmailOptions] {}

/// `x-batch-validation` on batch endpoints. `Strict` (the server default)
/// rejects the whole batch when one item is invalid; `Permissive` accepts the
/// valid subset and lists the rest under `errors`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BatchValidation {
    Strict,
    Permissive,
}

impl BatchValidation {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            BatchValidation::Strict => "strict",
            BatchValidation::Permissive => "permissive",
        }
    }
}

/// A per-item failure from a permissive batch, addressed by request index.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct BatchError {
    pub index: u32,
    pub message: String,
}

/// `{ object, id, deleted: true }` — the envelope every `delete` returns.
#[derive(Debug, Clone, Deserialize)]
pub struct Deleted {
    pub object: String,
    pub id: String,
    pub deleted: bool,
}

// ---- shared list envelope ------------------------------------------------

/// Keyset pagination for `list` calls. `after`/`before` are mutually exclusive
/// UUID cursors; `limit` is 1–100 (server default 20).
#[derive(Debug, Clone, Default)]
pub struct ListOptions {
    pub limit: Option<u32>,
    pub after: Option<String>,
    pub before: Option<String>,
}

impl ListOptions {
    pub(crate) fn to_query(&self) -> Vec<(&'static str, String)> {
        let mut query = Vec::new();
        if let Some(limit) = self.limit {
            query.push(("limit", limit.to_string()));
        }
        if let Some(after) = &self.after {
            query.push(("after", after.clone()));
        }
        if let Some(before) = &self.before {
            query.push(("before", before.clone()));
        }
        query
    }
}

pub(crate) fn list_query(options: Option<&ListOptions>) -> Vec<(&'static str, String)> {
    options.map(ListOptions::to_query).unwrap_or_default()
}

/// The `{ object: "list", data, has_more }` envelope every paginated list returns.
#[derive(Debug, Clone, Deserialize)]
pub struct List<T> {
    pub object: String,
    pub data: Vec<T>,
    pub has_more: bool,
}

// ---- emails --------------------------------------------------------------

/// Build with `SendEmailOptions::new(from, to, subject)` then set the rest, or a
/// struct literal with `..Default::default()`.
#[derive(Debug, Clone, Default, Serialize)]
pub struct SendEmailOptions {
    pub from: String,
    pub to: Recipients,
    pub subject: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub html: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cc: Option<Recipients>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bcc: Option<Recipients>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_to: Option<Recipients>,
    /// ISO 8601 with offset; up to 30 days ahead.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scheduled_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<Tag>>,
    /// Recipients opted out of the topic are skipped and an unsubscribe link
    /// is added.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub topic_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachments: Option<Vec<Attachment>>,
    /// Extra message headers; transport headers are rejected by the API.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<HashMap<String, String>>,
    /// Passed through untouched so the API, not the SDK, decides whether
    /// templates are supported (it answers 422 while they are not).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template: Option<serde_json::Value>,
}

/// An attachment. `content` is base64; `path` is passed through so the API,
/// not the SDK, decides whether remote attachments are accepted.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct Attachment {
    pub filename: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

impl SendEmailOptions {
    pub fn new(
        from: impl Into<String>,
        to: impl Into<Recipients>,
        subject: impl Into<String>,
    ) -> Self {
        SendEmailOptions {
            from: from.into(),
            to: to.into(),
            subject: subject.into(),
            ..Default::default()
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateEmailResponse {
    pub id: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Email {
    pub object: String,
    pub id: String,
    pub from: String,
    pub to: Vec<String>,
    pub cc: Option<Vec<String>>,
    pub bcc: Option<Vec<String>>,
    pub reply_to: Option<Vec<String>>,
    pub subject: String,
    pub html: Option<String>,
    pub text: Option<String>,
    pub created_at: String,
    pub scheduled_at: Option<String>,
    pub message_id: String,
    pub last_event: String,
    /// Best-practice score (0–10, one decimal); `None` when the email has no
    /// insights (sent before the feature landed, or never sent).
    pub score: Option<f64>,
}

/// `GET /emails/:id/insights` — the pre-send best-practice report computed when
/// the email was sent.
#[derive(Debug, Clone, Deserialize)]
pub struct EmailInsights {
    pub object: String,
    pub email_id: String,
    /// Best-practice score, 0–10, one decimal.
    pub score: f64,
    pub score_version: u32,
    /// `excellent` | `good` | `needs_attention` | `at_risk` — kept a plain
    /// string so future bands never break deserialization.
    pub band: String,
    pub marketing: bool,
    pub html_size_bytes: Option<u64>,
    pub computed_at: String,
    pub checks: Vec<InsightCheck>,
}

/// One check from the insights report. `id` is an open catalog that grows
/// across score versions; `severity`/`status` stay plain strings for the same
/// reason `band` does.
#[derive(Debug, Clone, Deserialize)]
pub struct InsightCheck {
    pub id: String,
    /// `critical` | `major` | `minor` | `info`.
    pub severity: String,
    /// `pass` | `fail` | `passed_by_design` | `not_applicable` | `unknown`.
    pub status: String,
    /// Points deducted from the score; 0 unless `status` is `fail`.
    pub penalty: f64,
    /// Free-form per-check evidence; absent on most checks.
    #[serde(default)]
    pub detail: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CancelEmailResponse {
    pub object: String,
    pub id: String,
}

/// `PATCH /emails/:id` — reschedule a not-yet-sent email.
#[derive(Debug, Clone, Serialize)]
pub struct UpdateEmailOptions {
    pub scheduled_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateEmailResponse {
    pub object: String,
    pub id: String,
}

/// `GET /emails` item — the summary without bodies, `message_id` or `score`.
#[derive(Debug, Clone, Deserialize)]
pub struct EmailListItem {
    pub id: String,
    pub from: String,
    pub to: Vec<String>,
    pub cc: Option<Vec<String>>,
    pub bcc: Option<Vec<String>>,
    pub reply_to: Option<Vec<String>>,
    pub subject: String,
    pub created_at: String,
    pub scheduled_at: Option<String>,
    pub last_event: String,
}

pub type DeleteEmailResponse = Deleted;

/// `errors` is only populated under [`BatchValidation::Permissive`].
#[derive(Debug, Clone, Deserialize)]
pub struct BatchResponse {
    pub data: Vec<CreateEmailResponse>,
    #[serde(default)]
    pub errors: Vec<BatchError>,
}

// ---- deliverability ------------------------------------------------------

/// `GET /deliverability` — the account score over the trailing window. Scores
/// are 0–10 with one decimal; `None` means not enough data to compute.
#[derive(Debug, Clone, Deserialize)]
pub struct DeliverabilityReport {
    pub object: String,
    pub score: Option<f64>,
    /// `excellent` | `good` | `needs_attention` | `at_risk` — a plain string so
    /// future bands never break deserialization.
    pub band: Option<String>,
    pub content_score: Option<f64>,
    pub outcome_score: Option<f64>,
    pub complaint_rate: f64,
    pub hard_bounce_rate: f64,
    pub emails_sent: u64,
    pub scored_recipients: u64,
    pub window_days: u32,
    pub insufficient_outcome_data: bool,
    /// `ok` | `warning` | `paused` — plain string, same leniency rule.
    pub guardrail_status: String,
    pub score_version: u32,
}

// ---- contacts ------------------------------------------------------------

/// Build with `CreateContactOptions::new(email)`. Contacts are team-global;
/// duplicates (case-insensitive email) are a 409 `validation_error`.
#[derive(Debug, Clone, Default, Serialize)]
pub struct CreateContactOptions {
    pub email: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub first_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unsubscribed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub properties: Option<HashMap<String, serde_json::Value>>,
    /// Segments the contact joins on creation.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub segments: Option<Vec<SegmentRef>>,
    /// Initial per-topic subscription choices.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub topics: Option<Vec<ContactTopicUpdate>>,
}

impl CreateContactOptions {
    pub fn new(email: impl Into<String>) -> Self {
        CreateContactOptions {
            email: email.into(),
            ..Default::default()
        }
    }
}

/// `{ id }` — a segment referenced from a contact payload.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SegmentRef {
    pub id: String,
}

/// `on_conflict` for `POST /contacts/batch`: what happens to an item whose
/// email already belongs to a contact (or repeats inside the batch).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OnConflict {
    /// Fail the item (server default).
    Error,
    /// Keep the existing contact and report its id.
    Skip,
    /// Merge the item into the existing contact.
    Upsert,
}

impl OnConflict {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            OnConflict::Error => "error",
            OnConflict::Skip => "skip",
            OnConflict::Upsert => "upsert",
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct BatchContactsOptions {
    pub on_conflict: Option<OnConflict>,
    pub batch_validation: Option<BatchValidation>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BatchContactsResponse {
    /// One entry per successful item, in request order.
    pub data: Vec<BatchContactResult>,
    pub counts: BatchContactsCounts,
    /// Permissive mode only: the failed items by request index.
    #[serde(default)]
    pub errors: Vec<BatchError>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BatchContactResult {
    pub object: String,
    /// Position of the item in the request array.
    pub index: u32,
    /// The contact's id (the existing one for skipped/updated).
    pub id: String,
    pub status: BatchContactStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BatchContactStatus {
    Created,
    Updated,
    Skipped,
}

/// Per-status totals; they sum to the request length.
#[derive(Debug, Clone, Deserialize)]
pub struct BatchContactsCounts {
    pub created: u32,
    pub updated: u32,
    pub skipped: u32,
    pub failed: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AddContactSegmentResponse {
    pub id: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RemoveContactSegmentResponse {
    /// The contact id.
    pub id: String,
    /// The segment id, under Resend's legacy wire name.
    #[serde(rename = "audienceId")]
    pub audience_id: String,
    pub deleted: bool,
}

// ---- contact properties --------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ContactPropertyType {
    String,
    Number,
}

/// `fallback_value` is `Some(Value::Null)` to store an explicit null; its JSON
/// type must match `type`.
#[derive(Debug, Clone, Serialize)]
pub struct CreateContactPropertyOptions {
    pub key: String,
    pub r#type: ContactPropertyType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fallback_value: Option<serde_json::Value>,
}

/// `None` leaves the fallback unchanged; `Some(Value::Null)` clears it.
#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdateContactPropertyOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fallback_value: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ContactProperty {
    pub id: String,
    pub key: String,
    pub r#type: ContactPropertyType,
    pub fallback_value: Option<serde_json::Value>,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ContactPropertyId {
    pub object: String,
    pub id: String,
}

pub type DeleteContactPropertyResponse = Deleted;

/// Address a contact by id or email (email wins when both are set). A bare
/// `&str`/`String` is treated as an id.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ContactAddress {
    pub id: Option<String>,
    pub email: Option<String>,
}

impl ContactAddress {
    pub fn id(id: impl Into<String>) -> Self {
        ContactAddress {
            id: Some(id.into()),
            ..Default::default()
        }
    }

    pub fn email(email: impl Into<String>) -> Self {
        ContactAddress {
            email: Some(email.into()),
            ..Default::default()
        }
    }

    /// The path key: email wins over id.
    pub(crate) fn key(&self) -> &str {
        self.email.as_deref().or(self.id.as_deref()).unwrap_or("")
    }
}

impl From<&str> for ContactAddress {
    fn from(value: &str) -> Self {
        ContactAddress::id(value)
    }
}

impl From<String> for ContactAddress {
    fn from(value: String) -> Self {
        ContactAddress::id(value)
    }
}

impl From<&String> for ContactAddress {
    fn from(value: &String) -> Self {
        ContactAddress::id(value.clone())
    }
}

/// In a request body an address is `{ "email": … }` or `{ "id": … }` — one key,
/// chosen like [`ContactAddress::key`] (email wins), since the API rejects both.
impl Serialize for ContactAddress {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap as _;
        let mut map = serializer.serialize_map(Some(1))?;
        match (&self.email, &self.id) {
            (Some(email), _) => map.serialize_entry("email", email)?,
            (None, Some(id)) => map.serialize_entry("id", id)?,
            (None, None) => {}
        }
        map.end()
    }
}

/// Fields default to "leave unchanged". For `first_name`/`last_name`,
/// `Some(Some(v))` sets, `Some(None)` clears the field (sends `null`), and
/// `None` omits it.
#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdateContactOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub first_name: Option<Option<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_name: Option<Option<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unsubscribed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub properties: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ContactId {
    pub object: String,
    pub id: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Contact {
    pub object: String,
    pub id: String,
    pub email: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub created_at: String,
    pub unsubscribed: bool,
    /// Each value is a typed wrapper on the wire: `{ "type": "string", "value": "…" }`
    /// or `{ "type": "number", "value": 1 }`.
    #[serde(default)]
    pub properties: HashMap<String, serde_json::Value>,
}

/// Facets a contact read can attach (`?include=` on lists, `include` on
/// `batch_get`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ContactInclude {
    Properties,
    Topics,
}

impl ContactInclude {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            ContactInclude::Properties => "properties",
            ContactInclude::Topics => "topics",
        }
    }
}

/// [`ListOptions`] plus `include`, which attaches `properties` and/or `topics`
/// to every item (`?include=properties,topics`).
#[derive(Debug, Clone, Default)]
pub struct ListContactsOptions {
    pub limit: Option<u32>,
    pub after: Option<String>,
    pub before: Option<String>,
    pub include: Option<Vec<ContactInclude>>,
}

impl ListContactsOptions {
    pub(crate) fn to_query(&self) -> Vec<(&'static str, String)> {
        let mut query = ListOptions {
            limit: self.limit,
            after: self.after.clone(),
            before: self.before.clone(),
        }
        .to_query();
        if let Some(include) = &self.include {
            let names: Vec<_> = include.iter().map(|i| i.as_str()).collect();
            query.push(("include", names.join(",")));
        }
        query
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct ContactListItem {
    pub id: String,
    pub email: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub created_at: String,
    pub unsubscribed: bool,
    /// Only with `include: [Properties]`; the same typed wrappers as
    /// [`Contact::properties`].
    #[serde(default)]
    pub properties: Option<HashMap<String, serde_json::Value>>,
    /// Only with `include: [Topics]`; the same rows as `contacts.topics.list`.
    #[serde(default)]
    pub topics: Option<Vec<ContactTopic>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DeleteContactResponse {
    pub object: String,
    pub contact: String,
    pub deleted: bool,
}

/// `erase` for `contacts.delete` and `contacts.batch_remove`. A plain delete
/// keeps the contact's emails in the send log; `erase: true` also scrubs the
/// address from email history, event payloads and API logs (a GDPR/LGPD
/// erasure).
#[derive(Debug, Clone, Default)]
pub struct DeleteContactOptions {
    pub erase: bool,
}

/// Delete by contact ids or by email addresses (up to 1000 either way);
/// serializes as `{ "ids": [...] }` or `{ "emails": [...] }`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BatchRemoveContactsOptions {
    Ids(Vec<String>),
    Emails(Vec<String>),
}

/// Only the contacts actually deleted; unknown ids or addresses are skipped.
#[derive(Debug, Clone, Deserialize)]
pub struct BatchRemoveContactsResponse {
    pub data: Vec<DeleteContactResponse>,
}

/// `include` for `POST /contacts/batch/get`: facets attached to every contact
/// returned.
#[derive(Debug, Clone, Default)]
pub struct BatchGetContactsOptions {
    pub include: Option<Vec<ContactInclude>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BatchGetContactsResponse {
    pub object: String,
    /// The contacts found, in request order.
    pub data: Vec<BatchGetContact>,
    /// Request entries that matched no contact, by position in the request.
    pub missing: Vec<MissingContact>,
}

/// One contact as `batch_get` returns it: a [`ContactListItem`] plus `object`.
#[derive(Debug, Clone, Deserialize)]
pub struct BatchGetContact {
    pub object: String,
    pub id: String,
    pub email: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub created_at: String,
    pub unsubscribed: bool,
    /// Only with `include: [Properties]`; the same typed wrappers as
    /// [`Contact::properties`].
    #[serde(default)]
    pub properties: Option<HashMap<String, serde_json::Value>>,
    /// Only with `include: [Topics]`; the same rows as `contacts.topics.list`.
    #[serde(default)]
    pub topics: Option<Vec<ContactTopic>>,
}

/// A `batch_get` request entry that matched no contact, carrying whichever of
/// `id`/`email` the entry had.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct MissingContact {
    pub index: u32,
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
}

/// The contact's hosted preference page. The URL is a contact-scoped
/// capability with no expiry: anyone holding it can change that contact's
/// preferences, so hand it only to the contact.
#[derive(Debug, Clone, Deserialize)]
pub struct ContactPreferencesLink {
    pub object: String,
    pub contact: String,
    pub url: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TopicSubscription {
    OptIn,
    OptOut,
}

#[derive(Debug, Clone, Serialize)]
pub struct ContactTopicUpdate {
    pub id: String,
    pub subscription: TopicSubscription,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateContactTopicsResponse {
    pub id: String,
}

/// One row of `GET /contacts/:idOrEmail/topics`: `subscription` is the
/// contact's effective choice (the explicit one, else the topic default) and
/// `explicit` is false when it is the default.
#[derive(Debug, Clone, Deserialize)]
pub struct ContactTopic {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    pub subscription: TopicSubscription,
    pub explicit: bool,
    /// The hosted preference page lists public topics only.
    #[serde(default)]
    pub visibility: Option<TopicVisibility>,
}

// ---- topics --------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TopicVisibility {
    Private,
    Public,
}

#[derive(Debug, Clone, Serialize)]
pub struct CreateTopicOptions {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub default_subscription: TopicSubscription,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visibility: Option<TopicVisibility>,
}

impl CreateTopicOptions {
    pub fn new(name: impl Into<String>, default_subscription: TopicSubscription) -> Self {
        CreateTopicOptions {
            name: name.into(),
            description: None,
            default_subscription,
            visibility: None,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdateTopicOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visibility: Option<TopicVisibility>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Topic {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    pub default_subscription: TopicSubscription,
    #[serde(default)]
    pub visibility: Option<TopicVisibility>,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TopicId {
    pub id: String,
}

/// `GET /topics` returns every topic at once (`has_more` is always false), so
/// there are no cursors to expose.
#[derive(Debug, Clone, Deserialize)]
pub struct TopicList {
    pub data: Vec<Topic>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DeleteTopicResponse {
    pub id: String,
    pub object: String,
    pub deleted: bool,
}

// ---- broadcasts ----------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize)]
pub struct CreateBroadcastOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Neither `segment_id` nor `topic_id` set = send to all contacts.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub segment_id: Option<String>,
    pub from: String,
    pub subject: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub html: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_to: Option<Recipients>,
    /// Inbox preview (preheader) text.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub topic_id: Option<String>,
    /// `true` sends (or, with `scheduled_at`, schedules) immediately instead
    /// of saving a draft.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub send: Option<bool>,
    /// Requires `send: true`; ISO 8601 with offset or relative ("in 1 hour").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scheduled_at: Option<String>,
}

impl CreateBroadcastOptions {
    pub fn new(from: impl Into<String>, subject: impl Into<String>) -> Self {
        CreateBroadcastOptions {
            from: from.into(),
            subject: subject.into(),
            ..Default::default()
        }
    }
}

/// Fields default to "leave unchanged". To detach the topic set
/// `clear_topic_id: true`, which puts `"topic_id": null` on the wire.
#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdateBroadcastOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub segment_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub html: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_to: Option<Recipients>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub topic_id: Option<String>,
    /// Sends `"topic_id": null`; wins over `topic_id`. A flag rather than a
    /// nested `Option` so `topic_id: Some(id)` keeps working.
    #[serde(skip)]
    pub clear_topic_id: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BroadcastId {
    pub id: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BroadcastListItem {
    pub id: String,
    pub name: Option<String>,
    pub segment_id: Option<String>,
    pub status: String,
    pub created_at: String,
    pub scheduled_at: Option<String>,
    pub sent_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Broadcast {
    pub object: String,
    pub id: String,
    pub name: Option<String>,
    pub segment_id: Option<String>,
    pub status: String,
    pub created_at: String,
    pub scheduled_at: Option<String>,
    pub sent_at: Option<String>,
    pub from: String,
    pub subject: String,
    pub reply_to: Option<Vec<String>>,
    pub preview_text: Option<String>,
    pub topic_id: Option<String>,
    pub html: Option<String>,
    pub text: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CancelBroadcastResponse {
    pub object: String,
    pub id: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DeleteBroadcastResponse {
    pub object: String,
    pub id: String,
    pub deleted: bool,
}

// ---- segments (MillionSend dynamic segments) -----------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SegmentMatch {
    All,
    Any,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SegmentCondition {
    pub field: String,
    pub op: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub value: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SegmentFilter {
    #[serde(rename = "match")]
    pub match_: SegmentMatch,
    pub conditions: Vec<SegmentCondition>,
}

/// `filter: None` creates a manual-membership segment, fed only by
/// `contacts.segments.add` and `contacts.create`'s `segments`.
#[derive(Debug, Clone, Serialize)]
pub struct CreateSegmentOptions {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filter: Option<SegmentFilter>,
}

/// `filter`: `Some(Some(f))` replaces the filter, `Some(None)` clears it (sends
/// `null`, turning the segment manual-membership-only), `None` leaves it.
#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdateSegmentOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filter: Option<Option<SegmentFilter>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Segment {
    pub object: String,
    pub id: String,
    pub name: String,
    /// `None` for a manual-membership segment (contacts added via
    /// `contacts.segments.add`, no saved filter).
    pub filter: Option<SegmentFilter>,
    pub created_at: String,
    /// Present on `get` (a live count); absent on `create`/`list`/`update`.
    #[serde(default)]
    pub contact_count: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DeleteSegmentResponse {
    pub object: String,
    pub id: String,
    pub deleted: bool,
}

// ---- suppressions --------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SuppressionOrigin {
    Bounce,
    Complaint,
    Manual,
    Unsubscribe,
}

impl SuppressionOrigin {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            SuppressionOrigin::Bounce => "bounce",
            SuppressionOrigin::Complaint => "complaint",
            SuppressionOrigin::Manual => "manual",
            SuppressionOrigin::Unsubscribe => "unsubscribe",
        }
    }
}

/// `origin` defaults to `manual` server-side.
#[derive(Debug, Clone, Serialize)]
pub struct AddSuppressionOptions {
    pub email: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin: Option<SuppressionOrigin>,
}

impl AddSuppressionOptions {
    pub fn new(email: impl Into<String>) -> Self {
        AddSuppressionOptions {
            email: email.into(),
            origin: None,
        }
    }
}

/// [`ListOptions`] plus an optional `origin` filter.
#[derive(Debug, Clone, Default)]
pub struct ListSuppressionsOptions {
    pub limit: Option<u32>,
    pub after: Option<String>,
    pub before: Option<String>,
    pub origin: Option<SuppressionOrigin>,
}

impl ListSuppressionsOptions {
    pub(crate) fn to_query(&self) -> Vec<(&'static str, String)> {
        let mut query = ListOptions {
            limit: self.limit,
            after: self.after.clone(),
            before: self.before.clone(),
        }
        .to_query();
        if let Some(origin) = self.origin {
            query.push(("origin", origin.as_str().to_string()));
        }
        query
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct SuppressionId {
    pub object: String,
    pub id: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Suppression {
    pub id: String,
    pub email: String,
    pub origin: SuppressionOrigin,
    /// Email id whose bounce/complaint created the entry.
    pub source_id: Option<String>,
    pub created_at: String,
}

pub type DeleteSuppressionResponse = Deleted;

/// Up to 1000 addresses; duplicates collapse.
#[derive(Debug, Clone, Serialize)]
pub struct BatchAddSuppressionOptions {
    pub emails: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin: Option<SuppressionOrigin>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BatchAddSuppressionResponse {
    pub data: Vec<SuppressionId>,
}

/// Remove by addresses or by suppression ids (up to 1000 either way);
/// serializes as `{ "emails": [...] }` or `{ "ids": [...] }`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BatchRemoveSuppressionOptions {
    Emails(Vec<String>),
    Ids(Vec<String>),
}

#[derive(Debug, Clone, Deserialize)]
pub struct BatchRemoveSuppressionsResponse {
    pub data: Vec<Deleted>,
}

// ---- domains -------------------------------------------------------------

/// `region` is a plain string because each deployment serves its own SES
/// region and rejects any other with 422; omit it to use the deployment's.
#[derive(Debug, Clone, Default, Serialize)]
pub struct CreateDomainOptions {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub region: Option<String>,
    /// MAIL FROM subdomain label (server default `send`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_return_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub open_tracking: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub click_tracking: Option<bool>,
    /// DNS label of the branded tracking host, e.g. `links` for `links.<domain>`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tracking_subdomain: Option<String>,
}

impl CreateDomainOptions {
    pub fn new(name: impl Into<String>) -> Self {
        CreateDomainOptions {
            name: name.into(),
            ..Default::default()
        }
    }
}

/// `tracking_subdomain`: `Some(Some(label))` sets, `Some(None)` clears (sends
/// `null`), `None` leaves it. `tls`/`capabilities` are passed through so the
/// API, not the SDK, decides whether they are supported (422 while not).
#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdateDomainOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub open_tracking: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub click_tracking: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tracking_subdomain: Option<Option<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tls: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capabilities: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Domain {
    pub id: String,
    pub name: String,
    /// `not_started` | `pending` | `verified` | `failed` | … — kept a plain
    /// string so new states never break deserialization.
    pub status: String,
    pub created_at: String,
    pub region: String,
    pub open_tracking: bool,
    pub click_tracking: bool,
    pub tracking_subdomain: Option<String>,
    pub capabilities: DomainCapabilities,
    /// DNS records to publish; absent on `list`.
    #[serde(default)]
    pub records: Vec<DomainRecord>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DomainCapabilities {
    pub sending: String,
    pub receiving: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DomainRecord {
    /// `SPF` | `DKIM` | `Tracking` | …
    pub record: String,
    pub name: String,
    pub r#type: String,
    pub ttl: String,
    pub status: String,
    pub value: String,
    /// MX priority; only on MX records.
    #[serde(default)]
    pub priority: Option<u32>,
}

pub type DeleteDomainResponse = Deleted;

// ---- api keys ------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApiKeyPermission {
    FullAccess,
    SendingAccess,
}

/// `permission` defaults to `full_access`; `domain_id` restricts a
/// `sending_access` key to one domain.
#[derive(Debug, Clone, Default, Serialize)]
pub struct CreateApiKeyOptions {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permission: Option<ApiKeyPermission>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain_id: Option<String>,
}

impl CreateApiKeyOptions {
    pub fn new(name: impl Into<String>) -> Self {
        CreateApiKeyOptions {
            name: name.into(),
            ..Default::default()
        }
    }
}

/// The `token` is shown once, at creation.
#[derive(Debug, Clone, Deserialize)]
pub struct ApiKeyToken {
    pub id: String,
    pub token: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ApiKey {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub last_used_at: Option<String>,
}

pub type DeleteApiKeyResponse = Deleted;

// ---- webhooks ------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WebhookStatus {
    Enabled,
    Disabled,
}

/// `events` are wire names (`email.delivered`, `deliverability.paused`, …),
/// kept as strings because the catalog grows. `signing_secret` is optional:
/// omit it to have one minted; pass `whsec_…` to reuse an existing one.
#[derive(Debug, Clone, Default, Serialize)]
pub struct CreateWebhookOptions {
    pub endpoint: String,
    pub events: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signing_secret: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateWebhookResponse {
    pub object: String,
    pub id: String,
    pub signing_secret: String,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdateWebhookOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub endpoint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub events: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<WebhookStatus>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Webhook {
    pub id: String,
    pub endpoint: String,
    pub created_at: String,
    pub status: WebhookStatus,
    pub events: Option<Vec<String>>,
    /// Present on `get` only.
    #[serde(default)]
    pub signing_secret: Option<String>,
    /// Present on `get` only; set while a rotation's previous secret still
    /// signs deliveries alongside the current one.
    #[serde(default)]
    pub previous_secret_expires_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WebhookId {
    pub object: String,
    pub id: String,
}

/// Both fields optional: omit `signing_secret` to have one minted;
/// `overlap_hours` (0–72, server default 24) is how long the previous secret
/// keeps signing alongside the new one. Serializes as `{}` when both are unset.
#[derive(Debug, Clone, Default, Serialize)]
pub struct RotateWebhookOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signing_secret: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub overlap_hours: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RotateWebhookResponse {
    pub object: String,
    pub id: String,
    pub signing_secret: String,
    /// `None` when the previous secret was dropped at once (`overlap_hours: 0`).
    pub previous_secret_expires_at: Option<String>,
}

pub type DeleteWebhookResponse = Deleted;

// ---- templates -----------------------------------------------------------

/// `from`, `reply_to` and `variables` are passed through so the API, not the
/// SDK, decides whether they are supported (422 while not).
#[derive(Debug, Clone, Default, Serialize)]
pub struct CreateTemplateOptions {
    pub name: String,
    pub html: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    /// Case-sensitive handle, unique per team; `get`/`update`/`delete` accept
    /// it in place of the id.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alias: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_to: Option<Recipients>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variables: Option<Vec<serde_json::Value>>,
}

impl CreateTemplateOptions {
    pub fn new(name: impl Into<String>, html: impl Into<String>) -> Self {
        CreateTemplateOptions {
            name: name.into(),
            html: html.into(),
            ..Default::default()
        }
    }
}

/// For `subject`/`text`/`alias`, `Some(Some(v))` sets, `Some(None)` clears
/// (sends `null`), `None` leaves the field unchanged.
#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdateTemplateOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub html: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<Option<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<Option<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alias: Option<Option<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_to: Option<Recipients>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variables: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TemplateId {
    pub object: String,
    pub id: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TemplateListItem {
    pub id: String,
    pub name: String,
    pub alias: Option<String>,
    pub status: String,
    pub published_at: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Template {
    pub object: String,
    pub id: String,
    pub name: String,
    pub alias: Option<String>,
    pub status: String,
    pub published_at: String,
    pub created_at: String,
    pub updated_at: String,
    pub current_version_id: String,
    pub from: Option<String>,
    pub subject: Option<String>,
    pub reply_to: Option<Recipients>,
    pub html: String,
    pub text: Option<String>,
    #[serde(default)]
    pub variables: Vec<serde_json::Value>,
    pub has_unpublished_versions: bool,
}

pub type DeleteTemplateResponse = Deleted;

// ---- usage (MillionSend extension) ---------------------------------------

/// `GET /usage` — plan limits and today's send count. Self-hosted instances
/// report `cloud: false` with `plan: None` and null limits.
#[derive(Debug, Clone, Deserialize)]
pub struct UsageReport {
    pub object: String,
    pub cloud: bool,
    /// `free` | `pro` | `scale`; `None` when self-hosted.
    pub plan: Option<String>,
    pub limits: UsageLimits,
    pub today: UsageToday,
    pub team: UsageTeam,
    pub app_url: Option<String>,
}

/// `None` = unlimited (or self-hosted).
#[derive(Debug, Clone, Deserialize)]
pub struct UsageLimits {
    pub emails_per_day: Option<u64>,
    pub domains: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UsageToday {
    /// Emails accepted so far this UTC day.
    pub emails_sent: u64,
    /// Next UTC midnight, when the counter resets.
    pub resets_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UsageTeam {
    pub id: String,
    pub name: String,
}

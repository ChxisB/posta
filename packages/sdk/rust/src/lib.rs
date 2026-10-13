//! Official Rust SDK for [Posta](https://github.com/ChxisB/posta) — a
//! self-hostable, Resend-compatible email API.
//!
//! Construct a [`Posta`] once and reuse it (it is cheap to [`Clone`]). Each
//! resource hangs off a public field: `emails`, `batch`, `contacts`, `topics`,
//! `broadcasts`, `segments`, `suppressions`, `domains`, `webhooks`, `api_keys`,
//! `templates`, `deliverability`, `usage`.
//!
//! ```no_run
//! use posta::{Posta, SendEmailOptions};
//!
//! # async fn run() -> posta::Result<()> {
//! let ms = Posta::new("po_123");
//! let sent = ms
//!     .emails
//!     .send(&SendEmailOptions {
//!         from: "Acme <onboarding@acme.dev>".into(),
//!         to: "success@simulator.amazonses.com".into(),
//!         subject: "Hello".into(),
//!         html: Some("<strong>it works</strong>".into()),
//!         ..Default::default()
//!     })
//!     .await?;
//! println!("sent {}", sent.id);
//! # Ok(())
//! # }
//! ```
//!
//! Fallible calls return [`Result<T, Error>`](Error); [`Error::Api`] carries the
//! API's `{ statusCode, name, message }`, [`Error::Http`] a transport failure
//! (its [`status_code`](Error::status_code) is `None`).

mod api_keys;
mod broadcasts;
mod contacts;
mod deliverability;
mod domains;
mod emails;
mod error;
mod http;
mod segments;
mod suppressions;
mod templates;
mod topics;
mod types;
mod usage;
mod webhooks;

use std::sync::Arc;

use http::Config;

pub use api_keys::ApiKeys;
pub use broadcasts::Broadcasts;
pub use contacts::{ContactProperties, ContactSegments, ContactTopics, Contacts};
pub use deliverability::Deliverability;
pub use domains::Domains;
pub use emails::{Batch, Emails};
pub use error::{ApiError, Error, Result};
pub use segments::Segments;
pub use suppressions::Suppressions;
pub use templates::Templates;
pub use topics::Topics;
pub use types::*;
pub use usage::Usage;
pub use webhooks::Webhooks;

const DEFAULT_BASE_URL: &str = "https://api.posta.example";

/// The Posta client. Construct once and reuse.
#[derive(Clone)]
pub struct Posta {
    pub emails: Emails,
    pub batch: Batch,
    pub contacts: Contacts,
    pub topics: Topics,
    pub broadcasts: Broadcasts,
    pub segments: Segments,
    pub suppressions: Suppressions,
    pub domains: Domains,
    pub webhooks: Webhooks,
    pub api_keys: ApiKeys,
    pub templates: Templates,
    pub deliverability: Deliverability,
    pub usage: Usage,
}

impl Posta {
    /// Client for the given API key. The base URL falls back to
    /// `POSTA_BASE_URL`, then Posta Cloud (`https://api.posta.example`).
    /// Self-hosted instances set their origin with [`Posta::with_base_url`].
    pub fn new(api_key: impl Into<String>) -> Self {
        let base_url =
            std::env::var("POSTA_BASE_URL").unwrap_or_else(|_| DEFAULT_BASE_URL.to_string());
        Self::build(api_key.into(), base_url)
    }

    /// Client for the given API key pointed at an explicit base URL (a
    /// self-hosted instance).
    pub fn with_base_url(api_key: impl Into<String>, base_url: impl Into<String>) -> Self {
        Self::build(api_key.into(), base_url.into())
    }

    /// Client built from `POSTA_API_KEY` (and optional
    /// `POSTA_BASE_URL`). Errors if the key is unset.
    pub fn from_env() -> Result<Self> {
        let api_key = std::env::var("POSTA_API_KEY").map_err(|_| {
            Error::Api(ApiError {
                status_code: None,
                name: "missing_api_key".to_string(),
                message: "Set POSTA_API_KEY or use Posta::new(api_key).".to_string(),
            })
        })?;
        Ok(Self::new(api_key))
    }

    /// Replace the underlying [`reqwest::Client`] (custom timeouts, proxies,
    /// TLS settings). The default has a 30s request and 10s connect timeout.
    pub fn with_client(self, client: reqwest::Client) -> Self {
        Self::from_config(self.config().with_client(client))
    }

    /// Accept a plain `http://` base URL on a non-loopback host. Off by default
    /// because the API key travels as a bearer header.
    pub fn allow_insecure_http(self) -> Self {
        Self::from_config(self.config().allow_insecure_http())
    }

    /// The base URL every request is sent to (no trailing slash).
    pub fn base_url(&self) -> &str {
        self.emails.0.base_url()
    }

    fn config(&self) -> Config {
        (*self.emails.0).clone()
    }

    fn build(api_key: String, base_url: String) -> Self {
        Self::from_config(Config::new(api_key, base_url))
    }

    fn from_config(config: Config) -> Self {
        let config = Arc::new(config);
        Posta {
            emails: Emails(config.clone()),
            batch: Batch(config.clone()),
            contacts: Contacts::new(config.clone()),
            topics: Topics(config.clone()),
            broadcasts: Broadcasts(config.clone()),
            segments: Segments(config.clone()),
            suppressions: Suppressions(config.clone()),
            domains: Domains(config.clone()),
            webhooks: Webhooks(config.clone()),
            api_keys: ApiKeys(config.clone()),
            templates: Templates(config.clone()),
            deliverability: Deliverability(config.clone()),
            usage: Usage(config),
        }
    }
}

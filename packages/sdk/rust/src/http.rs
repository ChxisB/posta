use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use reqwest::{Client, RequestBuilder, Url};
use serde::{de::DeserializeOwned, Serialize};
use std::fmt::Write as _;
use std::time::Duration;

use crate::error::{ApiError, Error, Result};

const SDK_VERSION: &str = env!("CARGO_PKG_VERSION");
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

/// True for an `http://` URL whose host is not loopback. Unparseable URLs are
/// left for reqwest to reject.
fn is_insecure_http_url(raw: &str) -> bool {
    let Ok(url) = Url::parse(raw) else {
        return false;
    };
    if url.scheme() != "http" {
        return false;
    }
    let host = url.host_str().unwrap_or("").to_ascii_lowercase();
    !matches!(host.as_str(), "localhost" | "[::1]") && !host.starts_with("127.")
}

/// The set JS `encodeURIComponent` leaves untouched: encode everything but the
/// unreserved marks. Keeps path segments (emails contain `@`) wire-identical to
/// the other MillionSend SDKs.
const COMPONENT: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'!')
    .remove(b'~')
    .remove(b'*')
    .remove(b'\'')
    .remove(b'(')
    .remove(b')');

/// Shared transport: holds auth + base URL and turns typed calls into requests.
/// Cloneable and cheap to share — every service holds an `Arc<Config>`.
#[derive(Clone)]
pub(crate) struct Config {
    api_key: String,
    base_url: String,
    user_agent: String,
    client: Client,
    allow_insecure_http: bool,
}

impl Config {
    pub(crate) fn new(api_key: String, base_url: String) -> Self {
        // Same panic contract as `Client::new()`: only a broken TLS backend fails here.
        let client = Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .connect_timeout(CONNECT_TIMEOUT)
            .build()
            .expect("reqwest client");
        Config {
            api_key,
            base_url: base_url.trim_end_matches('/').to_string(),
            user_agent: format!("millionsend-rust/{SDK_VERSION}"),
            client,
            allow_insecure_http: false,
        }
    }

    pub(crate) fn with_client(mut self, client: Client) -> Self {
        self.client = client;
        self
    }

    pub(crate) fn allow_insecure_http(mut self) -> Self {
        self.allow_insecure_http = true;
        self
    }

    pub(crate) fn base_url(&self) -> &str {
        &self.base_url
    }

    fn url(&self, segments: &[&str]) -> String {
        let mut url = self.base_url.clone();
        for &segment in segments {
            url.push('/');
            let _ = write!(url, "{}", utf8_percent_encode(segment, COMPONENT));
        }
        url
    }

    fn url_with_query(&self, segments: &[&str], query: &[(&'static str, String)]) -> String {
        let mut url = self.url(segments);
        for (i, (key, value)) in query.iter().enumerate() {
            url.push(if i == 0 { '?' } else { '&' });
            let _ = write!(url, "{}={}", key, utf8_percent_encode(value, COMPONENT));
        }
        url
    }

    pub(crate) async fn get<T: DeserializeOwned>(
        &self,
        segments: &[&str],
        query: &[(&'static str, String)],
    ) -> Result<T> {
        let url = self.url_with_query(segments, query);
        self.run(self.client.get(url)).await
    }

    pub(crate) async fn post<B: Serialize + ?Sized, T: DeserializeOwned>(
        &self,
        segments: &[&str],
        body: &B,
    ) -> Result<T> {
        self.post_with(segments, &[], body, &[]).await
    }

    /// POST with query parameters and extra request headers (`Idempotency-Key`,
    /// `x-batch-validation`); `None` header values are skipped.
    pub(crate) async fn post_with<B: Serialize + ?Sized, T: DeserializeOwned>(
        &self,
        segments: &[&str],
        query: &[(&'static str, String)],
        body: &B,
        headers: &[(&'static str, Option<&str>)],
    ) -> Result<T> {
        let mut req = self
            .client
            .post(self.url_with_query(segments, query))
            .json(body);
        for (name, value) in headers {
            if let Some(value) = value {
                req = req.header(*name, *value);
            }
        }
        self.run(req).await
    }

    pub(crate) async fn post_empty<T: DeserializeOwned>(&self, segments: &[&str]) -> Result<T> {
        self.run(self.client.post(self.url(segments))).await
    }

    pub(crate) async fn patch<B: Serialize + ?Sized, T: DeserializeOwned>(
        &self,
        segments: &[&str],
        body: &B,
    ) -> Result<T> {
        self.run(self.client.patch(self.url(segments)).json(body))
            .await
    }

    pub(crate) async fn delete<T: DeserializeOwned>(&self, segments: &[&str]) -> Result<T> {
        self.delete_with(segments, &[]).await
    }

    pub(crate) async fn delete_with<T: DeserializeOwned>(
        &self,
        segments: &[&str],
        query: &[(&'static str, String)],
    ) -> Result<T> {
        let url = self.url_with_query(segments, query);
        self.run(self.client.delete(url)).await
    }

    async fn run<T: DeserializeOwned>(&self, req: RequestBuilder) -> Result<T> {
        // The API key travels as a bearer header, so plain http is loopback-only by default.
        if !self.allow_insecure_http && is_insecure_http_url(&self.base_url) {
            return Err(Error::Api(ApiError {
                status_code: None,
                name: "insecure_base_url".to_string(),
                message: format!(
                    "Refusing to send the API key over plain http to {}. Use https, or call MillionSend::allow_insecure_http().",
                    self.base_url
                ),
            }));
        }
        let response = req
            .bearer_auth(&self.api_key)
            .header(reqwest::header::ACCEPT, "application/json")
            .header(reqwest::header::USER_AGENT, self.user_agent.as_str())
            .send()
            .await
            .map_err(Error::Http)?;

        let status = response.status();
        let body = response.bytes().await.map_err(Error::Http)?;

        if status.is_success() {
            serde_json::from_slice(&body).map_err(Error::Parse)
        } else {
            Err(Error::Api(ApiError::parse(status.as_u16(), &body)))
        }
    }
}

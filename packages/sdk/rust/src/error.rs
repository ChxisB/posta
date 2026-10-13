use serde::Deserialize;
use std::fmt;

/// The API's canonical error shape (`{ statusCode, name, message }`), plus the
/// client-side conditions that never reached the API, which carry
/// `status_code: None`. Mirrors Resend's `ErrorResponse`, so code that switches
/// on `name` ports across unchanged.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApiError {
    /// HTTP status; `None` when the request never reached the API.
    pub status_code: Option<u16>,
    /// Stable snake_case discriminant, e.g. `validation_error`, `not_found`.
    pub name: String,
    pub message: String,
}

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.status_code {
            Some(status) => write!(f, "{} ({}): {}", self.name, status, self.message),
            None => write!(f, "{}: {}", self.name, self.message),
        }
    }
}

/// Wire body is camelCase `statusCode`; every field optional so a malformed or
/// partial error body still parses into a sensible fallback.
#[derive(Deserialize)]
struct RawApiError {
    #[serde(rename = "statusCode")]
    status_code: Option<u16>,
    name: Option<String>,
    message: Option<String>,
}

impl ApiError {
    pub(crate) fn parse(status: u16, body: &[u8]) -> Self {
        if let Ok(raw) = serde_json::from_slice::<RawApiError>(body) {
            return ApiError {
                status_code: raw.status_code.or(Some(status)),
                name: raw.name.unwrap_or_else(|| "application_error".to_string()),
                message: raw
                    .message
                    .unwrap_or_else(|| format!("Request failed with status {status}")),
            };
        }
        ApiError {
            status_code: Some(status),
            name: "application_error".to_string(),
            message: format!("Request failed with status {status}"),
        }
    }
}

/// Every fallible SDK call resolves to `Result<T, Error>`.
#[derive(Debug)]
pub enum Error {
    /// Transport/connection failure — the request never reached the API, so
    /// [`Error::status_code`] is `None`.
    Http(reqwest::Error),
    /// A non-2xx response carrying the API's `{ statusCode, name, message }`.
    Api(ApiError),
    /// A 2xx body that could not be deserialized into the expected type.
    Parse(serde_json::Error),
}

impl Error {
    /// HTTP status of an API error; `None` for transport/parse failures.
    pub fn status_code(&self) -> Option<u16> {
        match self {
            Error::Api(err) => err.status_code,
            _ => None,
        }
    }

    /// Stable error name of an API error, if this is one.
    pub fn name(&self) -> Option<&str> {
        match self {
            Error::Api(err) => Some(&err.name),
            _ => None,
        }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Http(err) => write!(f, "http error: {err}"),
            Error::Api(err) => write!(f, "api error: {err}"),
            Error::Parse(err) => write!(f, "parse error: {err}"),
        }
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Error::Http(err) => Some(err),
            Error::Parse(err) => Some(err),
            Error::Api(_) => None,
        }
    }
}

/// Shorthand for `std::result::Result<T, millionsend::Error>`.
pub type Result<T> = std::result::Result<T, Error>;

use std::sync::Arc;

use crate::error::Result;
use crate::http::Config;
use crate::types::UsageReport;

/// Plan limits and today's send count (MillionSend extension).
#[derive(Clone)]
pub struct Usage(pub(crate) Arc<Config>);

impl Usage {
    /// `GET /usage`
    pub async fn get(&self) -> Result<UsageReport> {
        self.0.get(&["usage"], &[]).await
    }
}

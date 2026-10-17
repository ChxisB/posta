use std::sync::Arc;

use crate::error::Result;
use crate::http::Config;
use crate::types::DeliverabilityReport;

/// Account-level deliverability score over the trailing window.
#[derive(Clone)]
pub struct Deliverability(pub(crate) Arc<Config>);

impl Deliverability {
    /// `GET /deliverability`
    pub async fn get(&self) -> Result<DeliverabilityReport> {
        self.0.get(&["deliverability"], &[]).await
    }
}

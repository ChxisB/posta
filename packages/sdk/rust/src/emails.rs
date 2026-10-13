use std::sync::Arc;

use crate::error::Result;
use crate::http::Config;
use crate::types::{
    list_query, BatchResponse, BatchValidation, CancelEmailResponse, CreateEmailResponse,
    DeleteEmailResponse, Email, EmailInsights, EmailListItem, Idempotent, List, ListOptions,
    SendEmailOptions, UpdateEmailOptions, UpdateEmailResponse,
};

/// Transactional email. Mirrors Resend's `emails` resource.
#[derive(Clone)]
pub struct Emails(pub(crate) Arc<Config>);

impl Emails {
    /// `POST /emails`. Pass `&email`, or `email.with_idempotency_key("k")` to
    /// attach an `Idempotency-Key` (retries collapse to one send).
    pub async fn send<'a>(
        &self,
        email: impl Into<Idempotent<&'a SendEmailOptions>>,
    ) -> Result<CreateEmailResponse> {
        let email = email.into();
        self.0
            .post_with(
                &["emails"],
                &[],
                email.data,
                &[("Idempotency-Key", email.idempotency_key.as_deref())],
            )
            .await
    }

    /// `POST /emails` with an `Idempotency-Key`.
    pub async fn send_with_idempotency_key(
        &self,
        email: &SendEmailOptions,
        idempotency_key: &str,
    ) -> Result<CreateEmailResponse> {
        self.send(Idempotent {
            data: email,
            idempotency_key: Some(idempotency_key.to_string()),
        })
        .await
    }

    /// `GET /emails/:id`
    pub async fn get(&self, id: &str) -> Result<Email> {
        self.0.get(&["emails", id], &[]).await
    }

    /// `GET /emails`
    pub async fn list(&self, options: Option<&ListOptions>) -> Result<List<EmailListItem>> {
        self.0.get(&["emails"], &list_query(options)).await
    }

    /// `PATCH /emails/:id` — reschedule a scheduled, unsent email.
    pub async fn update(
        &self,
        id: &str,
        changes: &UpdateEmailOptions,
    ) -> Result<UpdateEmailResponse> {
        self.0.patch(&["emails", id], changes).await
    }

    /// `GET /emails/:id/insights` — the pre-send best-practice report. 404
    /// (`not_found`) when the email is unknown or has no insights yet.
    pub async fn get_insights(&self, id: &str) -> Result<EmailInsights> {
        self.0.get(&["emails", id, "insights"], &[]).await
    }

    /// `POST /emails/:id/cancel` — only scheduled, unsent emails.
    pub async fn cancel(&self, id: &str) -> Result<CancelEmailResponse> {
        self.0.post_empty(&["emails", id, "cancel"]).await
    }

    /// `DELETE /emails/:id`
    pub async fn delete(&self, id: &str) -> Result<DeleteEmailResponse> {
        self.0.delete(&["emails", id]).await
    }
}

/// Batch send. Mirrors Resend's `batch` resource.
#[derive(Clone)]
pub struct Batch(pub(crate) Arc<Config>);

impl Batch {
    /// `POST /emails/batch` — 1–100 emails as a bare array. Pass `&emails`, or
    /// `emails.with_idempotency_key("k")`.
    pub async fn send<'a>(
        &self,
        emails: impl Into<Idempotent<&'a [SendEmailOptions]>>,
    ) -> Result<BatchResponse> {
        self.post(emails.into(), None).await
    }

    /// `POST /emails/batch` with an `Idempotency-Key`.
    pub async fn send_with_idempotency_key(
        &self,
        emails: &[SendEmailOptions],
        idempotency_key: &str,
    ) -> Result<BatchResponse> {
        let emails = Idempotent {
            data: emails,
            idempotency_key: Some(idempotency_key.to_string()),
        };
        self.post(emails, None).await
    }

    /// `POST /emails/batch` with an explicit `x-batch-validation`. Under
    /// [`BatchValidation::Permissive`] invalid items land in `errors` instead of
    /// failing the call.
    pub async fn send_with_batch_validation<'a>(
        &self,
        emails: impl Into<Idempotent<&'a [SendEmailOptions]>>,
        validation: BatchValidation,
    ) -> Result<BatchResponse> {
        self.post(emails.into(), Some(validation)).await
    }

    async fn post(
        &self,
        emails: Idempotent<&[SendEmailOptions]>,
        validation: Option<BatchValidation>,
    ) -> Result<BatchResponse> {
        self.0
            .post_with(
                &["emails", "batch"],
                &[],
                emails.data,
                &[
                    ("Idempotency-Key", emails.idempotency_key.as_deref()),
                    (
                        "x-batch-validation",
                        validation.map(BatchValidation::as_str),
                    ),
                ],
            )
            .await
    }
}

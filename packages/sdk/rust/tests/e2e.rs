//! Opt-in end-to-end smoke test against a real MillionSend instance. Runs only
//! when `MILLIONSEND_API_KEY` is set (and `MILLIONSEND_BASE_URL` for a
//! self-hosted instance; Cloud is the default); otherwise it returns early.
//! Exercises the contact lifecycle, which needs no verified sender domain.
//!
//! ```sh
//! MILLIONSEND_API_KEY=ms_... MILLIONSEND_BASE_URL=http://localhost:3001 \
//!   cargo test --test e2e -- --nocapture
//! ```

use millionsend::{ContactAddress, CreateContactOptions, MillionSend, UpdateContactOptions};

#[tokio::test]
async fn contact_lifecycle() {
    if std::env::var("MILLIONSEND_API_KEY").is_err() {
        eprintln!("skipping e2e: MILLIONSEND_API_KEY not set");
        return;
    }
    let ms = MillionSend::from_env().expect("MILLIONSEND_API_KEY");

    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();

    let email = format!("sdk-e2e-{stamp}@example.com");
    ms.contacts
        .create(&CreateContactOptions {
            email: email.clone(),
            first_name: Some("Ada".into()),
            ..Default::default()
        })
        .await
        .expect("create contact");

    // Duplicate email (case-insensitive per team) is a 409 validation_error.
    let dup = ms
        .contacts
        .create(&CreateContactOptions::new(email.to_uppercase()))
        .await;
    assert_eq!(dup.unwrap_err().status_code(), Some(409));

    let fetched = ms
        .contacts
        .get(ContactAddress::email(email.as_str()))
        .await
        .expect("get contact");
    assert_eq!(fetched.email, email);
    assert_eq!(fetched.first_name.as_deref(), Some("Ada"));

    ms.contacts
        .update(
            ContactAddress::email(email.as_str()),
            &UpdateContactOptions {
                unsubscribed: Some(true),
                ..Default::default()
            },
        )
        .await
        .expect("update contact");

    let removed = ms
        .contacts
        .delete(ContactAddress::email(email.as_str()), None)
        .await
        .expect("delete contact");
    assert!(removed.deleted);

    // A missing contact surfaces as a typed error, not a panic.
    let missing = ms
        .contacts
        .get(ContactAddress::email("does-not-exist@example.com"))
        .await;
    assert!(missing.is_err());
}

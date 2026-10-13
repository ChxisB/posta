package com.millionsend.model;

/**
 * Response from {@code webhooks().rotate(...)}: the secret deliveries are
 * signed with from now on, and when the previous one stops signing.
 */
public final class RotateWebhookResponse {

  private String object;
  private String id;
  private String signingSecret;
  private String previousSecretExpiresAt;

  public String getObject() {
    return object;
  }

  public String getId() {
    return id;
  }

  public String getSigningSecret() {
    return signingSecret;
  }

  /** ISO timestamp until which deliveries also carry the previous secret's signature; null when none. */
  public String getPreviousSecretExpiresAt() {
    return previousSecretExpiresAt;
  }
}

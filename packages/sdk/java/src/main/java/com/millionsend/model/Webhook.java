package com.millionsend.model;

import java.util.List;

/**
 * A webhook endpoint. {@code signingSecret} is only populated when a single
 * webhook is fetched; {@code events} is {@code null} when subscribed to every
 * event type.
 */
public final class Webhook {

  private String object;
  private String id;
  private String endpoint;
  private String createdAt;
  private String status;
  private List<String> events;
  private String signingSecret;
  private String previousSecretExpiresAt;

  public String getObject() {
    return object;
  }

  public String getId() {
    return id;
  }

  public String getEndpoint() {
    return endpoint;
  }

  public String getCreatedAt() {
    return createdAt;
  }

  /** {@code enabled} or {@code disabled}. */
  public String getStatus() {
    return status;
  }

  public List<String> getEvents() {
    return events;
  }

  public String getSigningSecret() {
    return signingSecret;
  }

  /**
   * While set, deliveries are also signed with the secret a rotation replaced
   * (only populated when a single webhook is fetched); null when no window is open.
   */
  public String getPreviousSecretExpiresAt() {
    return previousSecretExpiresAt;
  }
}

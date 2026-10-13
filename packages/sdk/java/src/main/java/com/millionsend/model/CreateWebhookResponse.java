package com.millionsend.model;

/** Response from {@code webhooks().create(...)}: the id and the signing secret to verify payloads with. */
public final class CreateWebhookResponse {

  private String object;
  private String id;
  private String signingSecret;

  public String getObject() {
    return object;
  }

  public String getId() {
    return id;
  }

  public String getSigningSecret() {
    return signingSecret;
  }
}

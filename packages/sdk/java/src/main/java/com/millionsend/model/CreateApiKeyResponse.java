package com.millionsend.model;

/** Response from {@code apiKeys().create(...)}: the only time the {@code token} is shown. */
public final class CreateApiKeyResponse {

  private String id;
  private String token;

  public String getId() {
    return id;
  }

  public String getToken() {
    return token;
  }
}

package com.millionsend.model;

/** An API key as listed by {@code apiKeys().list()} — the token itself is never returned again. */
public final class ApiKey {

  private String id;
  private String name;
  private String createdAt;
  private String lastUsedAt;

  public String getId() {
    return id;
  }

  public String getName() {
    return name;
  }

  public String getCreatedAt() {
    return createdAt;
  }

  /** {@code null} until the key is first used. */
  public String getLastUsedAt() {
    return lastUsedAt;
  }
}

package com.millionsend.model;

/** A custom contact property definition ({@code contactProperties()}). */
public final class ContactProperty {

  private String object;
  private String id;
  private String createdAt;
  private String key;
  private String type;
  private Object fallbackValue;

  public String getObject() {
    return object;
  }

  public String getId() {
    return id;
  }

  public String getCreatedAt() {
    return createdAt;
  }

  public String getKey() {
    return key;
  }

  /** {@code string} or {@code number}. */
  public String getType() {
    return type;
  }

  /** A {@link String}, a {@link Number}, or {@code null} when unset. */
  public Object getFallbackValue() {
    return fallbackValue;
  }
}

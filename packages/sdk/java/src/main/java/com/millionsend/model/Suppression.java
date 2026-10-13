package com.millionsend.model;

/** A suppressed address. */
public final class Suppression {

  private String object;
  private String id;
  private String email;
  private SuppressionOrigin origin;
  private String sourceId;
  private String createdAt;

  public String getObject() {
    return object;
  }

  public String getId() {
    return id;
  }

  public String getEmail() {
    return email;
  }

  public SuppressionOrigin getOrigin() {
    return origin;
  }

  /** The email whose bounce/complaint created the entry; {@code null} for manual ones. */
  public String getSourceId() {
    return sourceId;
  }

  public String getCreatedAt() {
    return createdAt;
  }
}

package com.millionsend.model;

/**
 * The {@code { object, id, deleted }} shape returned by the remove operations
 * (topics, broadcasts, segments) and by the email/broadcast cancels
 * (which populate {@code object} and {@code id} only).
 */
public final class DeletedResponse {

  private String object;
  private String id;
  private Boolean deleted;

  public String getObject() {
    return object;
  }

  public String getId() {
    return id;
  }

  public Boolean getDeleted() {
    return deleted;
  }
}

package com.millionsend.model;

/** Response from {@code contacts().remove(...)} — carries the id in {@code contact}. */
public final class RemoveContactResponse {

  private String object;
  private String contact;
  private Boolean deleted;

  public String getObject() {
    return object;
  }

  public String getContact() {
    return contact;
  }

  public Boolean getDeleted() {
    return deleted;
  }
}

package com.millionsend.model;

/** Response from {@code emails().send(...)} — the new email's id. */
public final class CreateEmailResponse {

  private String id;

  public String getId() {
    return id;
  }
}

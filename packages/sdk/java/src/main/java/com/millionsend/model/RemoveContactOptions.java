package com.millionsend.model;

import java.util.Collections;
import java.util.Map;

/**
 * Options for {@code contacts().remove(...)}. Addressed by id or email (email
 * wins). A plain delete keeps the contact's emails in the send log; set
 * {@code erase} to also scrub the address from email history, event payloads
 * and API logs (a GDPR/LGPD erasure).
 */
public final class RemoveContactOptions {

  private String id;
  private String email;
  private boolean erase;

  private RemoveContactOptions() {}

  public static Builder builder() {
    return new Builder();
  }

  public String getId() {
    return id;
  }

  public String getEmail() {
    return email;
  }

  public boolean isErase() {
    return erase;
  }

  /** The wire query, or {@code null} when nothing is set ({@code ?erase=true}). */
  public Map<String, String> toQuery() {
    return erase ? Collections.singletonMap("erase", "true") : null;
  }

  public static final class Builder {
    private final RemoveContactOptions o = new RemoveContactOptions();

    public Builder id(String id) {
      o.id = id;
      return this;
    }

    public Builder email(String email) {
      o.email = email;
      return this;
    }

    /** Also scrub the address from email history, event payloads and API logs. */
    public Builder erase(boolean erase) {
      o.erase = erase;
      return this;
    }

    public RemoveContactOptions build() {
      return o;
    }
  }
}

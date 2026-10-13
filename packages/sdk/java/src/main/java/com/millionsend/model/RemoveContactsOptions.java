package com.millionsend.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.ArrayList;
import java.util.List;

/**
 * Options for {@code contacts().batch().remove(...)}: either {@code emails}
 * or {@code ids} (up to 1000 each), never both. A plain delete keeps the
 * contacts' emails in the send log; set {@code erase} to also scrub the
 * addresses from email history, event payloads and API logs (a GDPR/LGPD
 * erasure).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class RemoveContactsOptions {

  private List<String> emails;
  private List<String> ids;
  private Boolean erase;

  private RemoveContactsOptions() {}

  public static Builder builder() {
    return new Builder();
  }

  public static final class Builder {
    private final RemoveContactsOptions o = new RemoveContactsOptions();

    public Builder emails(List<String> emails) {
      o.emails = emails;
      return this;
    }

    public Builder email(String email) {
      if (o.emails == null) {
        o.emails = new ArrayList<>();
      }
      o.emails.add(email);
      return this;
    }

    public Builder ids(List<String> ids) {
      o.ids = ids;
      return this;
    }

    public Builder id(String id) {
      if (o.ids == null) {
        o.ids = new ArrayList<>();
      }
      o.ids.add(id);
      return this;
    }

    /** Also scrub the addresses from email history, event payloads and API logs. */
    public Builder erase(boolean erase) {
      o.erase = erase;
      return this;
    }

    /** @throws IllegalArgumentException unless exactly one of emails/ids is set */
    public RemoveContactsOptions build() {
      if ((o.emails == null) == (o.ids == null)) {
        throw new IllegalArgumentException("Set either emails or ids, not both.");
      }
      return o;
    }
  }
}

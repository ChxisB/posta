package com.millionsend.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.ArrayList;
import java.util.List;

/**
 * Options for {@code suppressions().batch().remove(...)}: either {@code emails}
 * or {@code ids} (up to 1000 each), never both.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class RemoveSuppressionsOptions {

  private List<String> emails;
  private List<String> ids;

  private RemoveSuppressionsOptions() {}

  public static Builder builder() {
    return new Builder();
  }

  public static final class Builder {
    private final RemoveSuppressionsOptions o = new RemoveSuppressionsOptions();

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

    /** @throws IllegalArgumentException unless exactly one of emails/ids is set */
    public RemoveSuppressionsOptions build() {
      if ((o.emails == null) == (o.ids == null)) {
        throw new IllegalArgumentException("Set either emails or ids, not both.");
      }
      return o;
    }
  }
}

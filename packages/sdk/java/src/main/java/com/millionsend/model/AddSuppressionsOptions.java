package com.millionsend.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.ArrayList;
import java.util.List;

/** Options for {@code suppressions().batch().add(...)}: up to 1000 addresses. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class AddSuppressionsOptions {

  private List<String> emails = new ArrayList<>();
  private SuppressionOrigin origin;

  private AddSuppressionsOptions() {}

  public static Builder builder() {
    return new Builder();
  }

  public static final class Builder {
    private final AddSuppressionsOptions o = new AddSuppressionsOptions();

    public Builder emails(List<String> emails) {
      o.emails = emails;
      return this;
    }

    public Builder email(String email) {
      o.emails.add(email);
      return this;
    }

    /** Recorded on newly created entries (server default {@code manual}). */
    public Builder origin(SuppressionOrigin origin) {
      o.origin = origin;
      return this;
    }

    public AddSuppressionsOptions build() {
      return o;
    }
  }
}

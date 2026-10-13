package com.millionsend.model;

import com.fasterxml.jackson.annotation.JsonInclude;

/** Options for {@code suppressions().add(...)}. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class AddSuppressionOptions {

  private String email;
  private SuppressionOrigin origin;

  private AddSuppressionOptions() {}

  public static Builder builder() {
    return new Builder();
  }

  public static final class Builder {
    private final AddSuppressionOptions o = new AddSuppressionOptions();

    public Builder email(String email) {
      o.email = email;
      return this;
    }

    /** Recorded on a newly created entry (server default {@code manual}). */
    public Builder origin(SuppressionOrigin origin) {
      o.origin = origin;
      return this;
    }

    public AddSuppressionOptions build() {
      return o;
    }
  }
}

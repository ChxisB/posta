package com.millionsend.model;

import com.fasterxml.jackson.annotation.JsonInclude;

/** Options for {@code emails().update(...)}: reschedule a not-yet-sent email. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class UpdateEmailOptions {

  private String scheduledAt;

  private UpdateEmailOptions() {}

  public static Builder builder() {
    return new Builder();
  }

  public static final class Builder {
    private final UpdateEmailOptions o = new UpdateEmailOptions();

    public Builder scheduledAt(String scheduledAt) {
      o.scheduledAt = scheduledAt;
      return this;
    }

    public UpdateEmailOptions build() {
      return o;
    }
  }
}

package com.millionsend.model;

import com.fasterxml.jackson.annotation.JsonInclude;

/** Options for {@code broadcasts().send(...)}. Omit {@code scheduledAt} to send now. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class SendBroadcastOptions {

  private String scheduledAt;

  public SendBroadcastOptions() {}

  public static Builder builder() {
    return new Builder();
  }

  public static final class Builder {
    private final SendBroadcastOptions o = new SendBroadcastOptions();

    public Builder scheduledAt(String scheduledAt) {
      o.scheduledAt = scheduledAt;
      return this;
    }

    public SendBroadcastOptions build() {
      return o;
    }
  }
}

package com.millionsend.model;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Options for {@code webhooks().rotate(...)}. Both fields are optional: the
 * server mints a secret when {@code signingSecret} is unset and applies its
 * default overlap when {@code overlapHours} is unset.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class RotateWebhookOptions {

  private String signingSecret;
  private Integer overlapHours;

  private RotateWebhookOptions() {}

  public static Builder builder() {
    return new Builder();
  }

  public static final class Builder {
    private final RotateWebhookOptions o = new RotateWebhookOptions();

    /** Bring your own secret: {@code whsec_} followed by base64 of 24-64 bytes. */
    public Builder signingSecret(String signingSecret) {
      o.signingSecret = signingSecret;
      return this;
    }

    /** Hours (0-72) the previous secret keeps signing alongside the new one; 0 drops it at once. */
    public Builder overlapHours(int overlapHours) {
      o.overlapHours = overlapHours;
      return this;
    }

    public RotateWebhookOptions build() {
      return o;
    }
  }
}

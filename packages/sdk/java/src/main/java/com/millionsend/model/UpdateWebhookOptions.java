package com.millionsend.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Options for {@code webhooks().update(...)}. All fields optional. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class UpdateWebhookOptions {

  private String endpoint;
  private List<WebhookEvent> events;
  private String status;

  private UpdateWebhookOptions() {}

  public static Builder builder() {
    return new Builder();
  }

  public static final class Builder {
    private final UpdateWebhookOptions o = new UpdateWebhookOptions();

    public Builder endpoint(String endpoint) {
      o.endpoint = endpoint;
      return this;
    }

    public Builder events(WebhookEvent... events) {
      o.events = new ArrayList<>(Arrays.asList(events));
      return this;
    }

    public Builder events(List<WebhookEvent> events) {
      o.events = events;
      return this;
    }

    /** {@code enabled} or {@code disabled}. */
    public Builder status(String status) {
      o.status = status;
      return this;
    }

    public UpdateWebhookOptions build() {
      return o;
    }
  }
}

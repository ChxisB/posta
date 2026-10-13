package com.millionsend.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Options for {@code webhooks().create(...)}. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class CreateWebhookOptions {

  private String endpoint;
  private List<WebhookEvent> events;
  private String signingSecret;

  private CreateWebhookOptions() {}

  public static Builder builder() {
    return new Builder();
  }

  public static final class Builder {
    private final CreateWebhookOptions o = new CreateWebhookOptions();

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

    /** Reuse an existing {@code whsec_…} secret instead of minting a new one. */
    public Builder signingSecret(String signingSecret) {
      o.signingSecret = signingSecret;
      return this;
    }

    public CreateWebhookOptions build() {
      return o;
    }
  }
}

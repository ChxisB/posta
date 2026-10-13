package io.github.tacklabs.posta.model;

import com.fasterxml.jackson.annotation.JsonInclude;

/** Options for {@code topics().create(...)}. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class CreateTopicOptions {

  private String name;
  private String description;
  private Subscription defaultSubscription;
  private String visibility;

  private CreateTopicOptions() {}

  public static Builder builder() {
    return new Builder();
  }

  public static final class Builder {
    private final CreateTopicOptions o = new CreateTopicOptions();

    public Builder name(String name) {
      o.name = name;
      return this;
    }

    public Builder description(String description) {
      o.description = description;
      return this;
    }

    public Builder defaultSubscription(Subscription defaultSubscription) {
      o.defaultSubscription = defaultSubscription;
      return this;
    }

    /** {@code private} (default) or {@code public}. */
    public Builder visibility(String visibility) {
      o.visibility = visibility;
      return this;
    }

    public CreateTopicOptions build() {
      return o;
    }
  }
}

package com.millionsend.model;

import com.fasterxml.jackson.annotation.JsonInclude;

/** Options for {@code topics().update(...)}. {@code defaultSubscription} is immutable after creation. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class UpdateTopicOptions {

  private String name;
  private String description;
  private String visibility;

  private UpdateTopicOptions() {}

  public static Builder builder() {
    return new Builder();
  }

  public static final class Builder {
    private final UpdateTopicOptions o = new UpdateTopicOptions();

    public Builder name(String name) {
      o.name = name;
      return this;
    }

    public Builder description(String description) {
      o.description = description;
      return this;
    }

    /** {@code private} or {@code public}. */
    public Builder visibility(String visibility) {
      o.visibility = visibility;
      return this;
    }

    public UpdateTopicOptions build() {
      return o;
    }
  }
}

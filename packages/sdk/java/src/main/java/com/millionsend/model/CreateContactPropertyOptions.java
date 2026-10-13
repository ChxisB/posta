package com.millionsend.model;

import com.fasterxml.jackson.annotation.JsonInclude;

/** Options for {@code contactProperties().create(...)}. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class CreateContactPropertyOptions {

  private String key;
  private String type;
  private Object fallbackValue;

  private CreateContactPropertyOptions() {}

  public static Builder builder() {
    return new Builder();
  }

  public static final class Builder {
    private final CreateContactPropertyOptions o = new CreateContactPropertyOptions();

    public Builder key(String key) {
      o.key = key;
      return this;
    }

    /** {@code string} or {@code number}. */
    public Builder type(String type) {
      o.type = type;
      return this;
    }

    /** A {@link String} or a {@link Number} matching {@code type}. */
    public Builder fallbackValue(Object fallbackValue) {
      o.fallbackValue = fallbackValue;
      return this;
    }

    public CreateContactPropertyOptions build() {
      return o;
    }
  }
}

package com.millionsend.model;

import com.fasterxml.jackson.annotation.JsonInclude;

/** Options for {@code apiKeys().create(...)}. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class CreateApiKeyOptions {

  private String name;
  private String permission;
  private String domainId;

  private CreateApiKeyOptions() {}

  public static Builder builder() {
    return new Builder();
  }

  public static final class Builder {
    private final CreateApiKeyOptions o = new CreateApiKeyOptions();

    public Builder name(String name) {
      o.name = name;
      return this;
    }

    /** {@code full_access} (default) or {@code sending_access}. */
    public Builder permission(String permission) {
      o.permission = permission;
      return this;
    }

    /** Restrict a {@code sending_access} key to one domain. */
    public Builder domainId(String domainId) {
      o.domainId = domainId;
      return this;
    }

    public CreateApiKeyOptions build() {
      return o;
    }
  }
}

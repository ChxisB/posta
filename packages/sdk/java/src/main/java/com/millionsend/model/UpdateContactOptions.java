package com.millionsend.model;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Options for {@code contacts().update(...)}. Addressed by id or email. Only
 * the fields you set are sent; passing {@code null} to
 * {@link Builder#firstName}/{@link Builder#lastName} clears that field, while
 * leaving it unset leaves it unchanged. That present-vs-null distinction is why
 * the changed fields are accumulated in a map rather than a plain bean.
 */
public final class UpdateContactOptions {

  private String id;
  private String email;
  private final Map<String, Object> changes = new LinkedHashMap<>();

  private UpdateContactOptions() {}

  public static Builder builder() {
    return new Builder();
  }

  public String getId() {
    return id;
  }

  public String getEmail() {
    return email;
  }

  /** The snake_case body to PATCH — only the fields the caller set. */
  public Map<String, Object> getChanges() {
    return changes;
  }

  public static final class Builder {
    private final UpdateContactOptions o = new UpdateContactOptions();

    public Builder id(String id) {
      o.id = id;
      return this;
    }

    public Builder email(String email) {
      o.email = email;
      return this;
    }

    /** {@code null} clears the first name. */
    public Builder firstName(String firstName) {
      o.changes.put("first_name", firstName);
      return this;
    }

    /** {@code null} clears the last name. */
    public Builder lastName(String lastName) {
      o.changes.put("last_name", lastName);
      return this;
    }

    public Builder unsubscribed(boolean unsubscribed) {
      o.changes.put("unsubscribed", unsubscribed);
      return this;
    }

    /** Merged into the existing properties; a {@code null} value removes that key. */
    public Builder properties(Map<String, Object> properties) {
      o.changes.put("properties", properties);
      return this;
    }

    public UpdateContactOptions build() {
      return o;
    }
  }
}

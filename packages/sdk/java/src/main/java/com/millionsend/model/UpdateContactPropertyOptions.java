package com.millionsend.model;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Options for {@code contactProperties().update(...)}. Only {@code fallbackValue}
 * is updatable; passing {@code null} clears it (an explicit JSON null), while not
 * calling the setter leaves it unchanged.
 */
public final class UpdateContactPropertyOptions {

  private String id;
  private final Map<String, Object> changes = new LinkedHashMap<>();

  private UpdateContactPropertyOptions() {}

  public static Builder builder() {
    return new Builder();
  }

  public String getId() {
    return id;
  }

  /** The snake_case body to PATCH — only the fields the caller set. */
  public Map<String, Object> getChanges() {
    return changes;
  }

  public static final class Builder {
    private final UpdateContactPropertyOptions o = new UpdateContactPropertyOptions();

    public Builder id(String id) {
      o.id = id;
      return this;
    }

    /** {@code null} clears the fallback. */
    public Builder fallbackValue(Object fallbackValue) {
      o.changes.put("fallback_value", fallbackValue);
      return this;
    }

    public UpdateContactPropertyOptions build() {
      return o;
    }
  }
}

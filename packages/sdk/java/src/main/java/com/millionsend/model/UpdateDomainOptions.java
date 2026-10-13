package com.millionsend.model;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Options for {@code domains().update(...)}. Only the fields you set are sent;
 * {@code trackingSubdomain(null)} clears the branded tracking host (an explicit
 * JSON null), while not calling it leaves it unchanged.
 */
public final class UpdateDomainOptions {

  private String id;
  private final Map<String, Object> changes = new LinkedHashMap<>();

  private UpdateDomainOptions() {}

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
    private final UpdateDomainOptions o = new UpdateDomainOptions();

    public Builder id(String id) {
      o.id = id;
      return this;
    }

    public Builder openTracking(boolean openTracking) {
      o.changes.put("open_tracking", openTracking);
      return this;
    }

    public Builder clickTracking(boolean clickTracking) {
      o.changes.put("click_tracking", clickTracking);
      return this;
    }

    /** {@code null} (or {@code ""}) clears the tracking subdomain. */
    public Builder trackingSubdomain(String trackingSubdomain) {
      o.changes.put("tracking_subdomain", trackingSubdomain);
      return this;
    }

    public UpdateDomainOptions build() {
      return o;
    }
  }
}

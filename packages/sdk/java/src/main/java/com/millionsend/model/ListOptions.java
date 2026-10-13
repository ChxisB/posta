package com.millionsend.model;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Keyset pagination for list endpoints. {@code after} and {@code before} are
 * mutually exclusive UUID cursors; {@code limit} is 1–100 (server default 20).
 */
public final class ListOptions {

  private Integer limit;
  private String after;
  private String before;

  public static Builder builder() {
    return new Builder();
  }

  /** Flatten into the wire query map, dropping unset params. */
  public Map<String, String> toQuery() {
    Map<String, String> q = new LinkedHashMap<>();
    if (limit != null) {
      q.put("limit", String.valueOf(limit));
    }
    if (after != null) {
      q.put("after", after);
    }
    if (before != null) {
      q.put("before", before);
    }
    return q;
  }

  public static final class Builder {
    private final ListOptions o = new ListOptions();

    public Builder limit(int limit) {
      o.limit = limit;
      return this;
    }

    public Builder after(String after) {
      o.after = after;
      return this;
    }

    public Builder before(String before) {
      o.before = before;
      return this;
    }

    public ListOptions build() {
      return o;
    }
  }
}

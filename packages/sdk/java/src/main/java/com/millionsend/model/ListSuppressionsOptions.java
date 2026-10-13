package com.millionsend.model;

import java.util.Map;

/** Pagination plus an optional {@code origin} filter for {@code suppressions().list(...)}. */
public final class ListSuppressionsOptions {

  private final ListOptions.Builder page = ListOptions.builder();
  private SuppressionOrigin origin;

  private ListSuppressionsOptions() {}

  public static Builder builder() {
    return new Builder();
  }

  /** Flatten into the wire query map, dropping unset params. */
  public Map<String, String> toQuery() {
    Map<String, String> q = page.build().toQuery();
    if (origin != null) {
      q.put("origin", origin.getValue());
    }
    return q;
  }

  public static final class Builder {
    private final ListSuppressionsOptions o = new ListSuppressionsOptions();

    public Builder limit(int limit) {
      o.page.limit(limit);
      return this;
    }

    public Builder after(String after) {
      o.page.after(after);
      return this;
    }

    public Builder before(String before) {
      o.page.before(before);
      return this;
    }

    public Builder origin(SuppressionOrigin origin) {
      o.origin = origin;
      return this;
    }

    public ListSuppressionsOptions build() {
      return o;
    }
  }
}

package com.millionsend.model;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Pagination plus an optional {@code include} for {@code contacts().list(...)}
 * and {@code segments().contacts(...)}.
 */
public final class ListContactsOptions {

  private final ListOptions.Builder page = ListOptions.builder();
  private List<ContactInclude> include;

  private ListContactsOptions() {}

  public static Builder builder() {
    return new Builder();
  }

  /** Flatten into the wire query map, dropping unset params. */
  public Map<String, String> toQuery() {
    Map<String, String> q = page.build().toQuery();
    if (include != null && !include.isEmpty()) {
      q.put(
          "include",
          include.stream().map(ContactInclude::getValue).collect(Collectors.joining(",")));
    }
    return q;
  }

  public static final class Builder {
    private final ListContactsOptions o = new ListContactsOptions();

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

    /** Attach {@code properties} and/or {@code topics} to every item ({@code ?include=properties,topics}). */
    public Builder include(ContactInclude... include) {
      o.include = Arrays.asList(include);
      return this;
    }

    public ListContactsOptions build() {
      return o;
    }
  }
}

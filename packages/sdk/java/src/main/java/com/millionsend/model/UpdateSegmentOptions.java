package com.millionsend.model;

import com.fasterxml.jackson.annotation.JsonInclude;

/** Options for {@code segments().update(...)}. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class UpdateSegmentOptions {

  private String name;
  private SegmentFilter filter;

  private UpdateSegmentOptions() {}

  public static Builder builder() {
    return new Builder();
  }

  public static final class Builder {
    private final UpdateSegmentOptions o = new UpdateSegmentOptions();

    public Builder name(String name) {
      o.name = name;
      return this;
    }

    public Builder filter(SegmentFilter filter) {
      o.filter = filter;
      return this;
    }

    public UpdateSegmentOptions build() {
      return o;
    }
  }
}

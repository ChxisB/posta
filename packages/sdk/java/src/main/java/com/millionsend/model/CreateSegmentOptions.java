package com.millionsend.model;

import com.fasterxml.jackson.annotation.JsonInclude;

/** Options for {@code segments().create(...)}. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class CreateSegmentOptions {

  private String name;
  private SegmentFilter filter;

  private CreateSegmentOptions() {}

  public static Builder builder() {
    return new Builder();
  }

  public static final class Builder {
    private final CreateSegmentOptions o = new CreateSegmentOptions();

    public Builder name(String name) {
      o.name = name;
      return this;
    }

    public Builder filter(SegmentFilter filter) {
      o.filter = filter;
      return this;
    }

    public CreateSegmentOptions build() {
      return o;
    }
  }
}

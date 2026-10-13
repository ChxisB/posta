package com.millionsend.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.ArrayList;
import java.util.List;

/** A segment's filter: {@code match} ("all" | "any") over a list of conditions. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class SegmentFilter {

  private String match;
  private List<SegmentCondition> conditions;

  public SegmentFilter() {}

  public SegmentFilter(String match, List<SegmentCondition> conditions) {
    this.match = match;
    this.conditions = conditions;
  }

  public static Builder builder() {
    return new Builder();
  }

  public String getMatch() {
    return match;
  }

  public List<SegmentCondition> getConditions() {
    return conditions;
  }

  public static final class Builder {
    private final SegmentFilter o = new SegmentFilter();

    public Builder match(String match) {
      o.match = match;
      return this;
    }

    public Builder conditions(List<SegmentCondition> conditions) {
      o.conditions = conditions;
      return this;
    }

    public Builder condition(SegmentCondition condition) {
      if (o.conditions == null) {
        o.conditions = new ArrayList<>();
      }
      o.conditions.add(condition);
      return this;
    }

    public SegmentFilter build() {
      return o;
    }
  }
}

package com.millionsend.model;

import com.fasterxml.jackson.annotation.JsonInclude;

/** One condition in a {@link SegmentFilter}: a field, an operator, and an optional value. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class SegmentCondition {

  private String field;
  private String op;
  private String value;

  public SegmentCondition() {}

  public SegmentCondition(String field, String op, String value) {
    this.field = field;
    this.op = op;
    this.value = value;
  }

  public SegmentCondition(String field, String op) {
    this(field, op, null);
  }

  public String getField() {
    return field;
  }

  public String getOp() {
    return op;
  }

  public String getValue() {
    return value;
  }
}

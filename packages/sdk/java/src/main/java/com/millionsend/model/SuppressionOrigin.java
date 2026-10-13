package com.millionsend.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** Why an address is suppressed. */
public enum SuppressionOrigin {
  BOUNCE("bounce"),
  COMPLAINT("complaint"),
  MANUAL("manual"),
  UNSUBSCRIBE("unsubscribe");

  private final String value;

  SuppressionOrigin(String value) {
    this.value = value;
  }

  @JsonValue
  public String getValue() {
    return value;
  }

  @JsonCreator
  public static SuppressionOrigin fromValue(String value) {
    for (SuppressionOrigin s : values()) {
      if (s.value.equals(value)) {
        return s;
      }
    }
    throw new IllegalArgumentException("Unknown suppression origin: " + value);
  }
}

package com.millionsend.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** A topic subscription state: opt in or opt out. */
public enum Subscription {
  OPT_IN("opt_in"),
  OPT_OUT("opt_out");

  private final String value;

  Subscription(String value) {
    this.value = value;
  }

  @JsonValue
  public String getValue() {
    return value;
  }

  @JsonCreator
  public static Subscription fromValue(String value) {
    for (Subscription s : values()) {
      if (s.value.equals(value)) {
        return s;
      }
    }
    throw new IllegalArgumentException("Unknown subscription: " + value);
  }
}

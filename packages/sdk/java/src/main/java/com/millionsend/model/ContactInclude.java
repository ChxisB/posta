package com.millionsend.model;

import com.fasterxml.jackson.annotation.JsonValue;

/**
 * A facet a contact read can attach to every item — a MillionSend extension for
 * {@code contacts().list(...)}, {@code segments().contacts(...)} and
 * {@code contacts().batch().get(...)}.
 */
public enum ContactInclude {
  PROPERTIES("properties"),
  TOPICS("topics");

  private final String value;

  ContactInclude(String value) {
    this.value = value;
  }

  @JsonValue
  public String getValue() {
    return value;
  }
}

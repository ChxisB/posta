package com.millionsend.model;

/**
 * The {@code x-batch-validation} mode. {@code STRICT} (server default) rejects
 * the whole batch on the first invalid item; {@code PERMISSIVE} accepts the
 * valid items and lists the rest in the response's {@code errors}.
 */
public enum BatchValidation {
  STRICT("strict"),
  PERMISSIVE("permissive");

  private final String value;

  BatchValidation(String value) {
    this.value = value;
  }

  public String getValue() {
    return value;
  }
}

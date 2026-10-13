package com.millionsend.model;

/** A contact's custom property as returned by the API: its declared type and the value. */
public final class ContactPropertyValue {

  private String type;
  private Object value;

  /** {@code string} or {@code number}. */
  public String getType() {
    return type;
  }

  /** A {@link String} or a {@link Number}, matching {@link #getType()}. */
  public Object getValue() {
    return value;
  }
}

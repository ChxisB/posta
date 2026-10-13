package com.millionsend.model;

import com.fasterxml.jackson.annotation.JsonInclude;

/** A name/value tag attached to an email. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class Tag {

  private String name;
  private String value;

  public Tag() {}

  public Tag(String name, String value) {
    this.name = name;
    this.value = value;
  }

  public String getName() {
    return name;
  }

  public String getValue() {
    return value;
  }
}

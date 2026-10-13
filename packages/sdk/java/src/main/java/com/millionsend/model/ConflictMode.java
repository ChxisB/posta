package com.millionsend.model;

/**
 * The {@code on_conflict} choice for {@code contacts().batch().create(...)}: what
 * happens to an item whose email already belongs to a contact.
 */
public enum ConflictMode {
  ERROR("error"),
  SKIP("skip"),
  UPSERT("upsert");

  private final String value;

  ConflictMode(String value) {
    this.value = value;
  }

  public String getValue() {
    return value;
  }
}

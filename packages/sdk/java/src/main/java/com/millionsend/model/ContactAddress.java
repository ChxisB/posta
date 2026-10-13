package com.millionsend.model;

/**
 * Addresses a contact by id or email. Email wins over id when both are set. A
 * bare-string id is the common case, so the services also accept a plain
 * {@code String}.
 */
public final class ContactAddress {

  private String id;
  private String email;

  private ContactAddress() {}

  public static Builder builder() {
    return new Builder();
  }

  /** An address by id (the bare-string shorthand). */
  public static ContactAddress id(String id) {
    return builder().id(id).build();
  }

  /** An address by email. */
  public static ContactAddress email(String email) {
    return builder().email(email).build();
  }

  public String getId() {
    return id;
  }

  public String getEmail() {
    return email;
  }

  public static final class Builder {
    private final ContactAddress o = new ContactAddress();

    public Builder id(String id) {
      o.id = id;
      return this;
    }

    public Builder email(String email) {
      o.email = email;
      return this;
    }

    public ContactAddress build() {
      return o;
    }
  }
}

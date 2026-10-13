package com.millionsend.model;

/**
 * Response from {@code contacts().preferencesLink(...)}: the contact's hosted
 * preference page. The URL never expires and lets its holder change that
 * contact's preferences, so hand it only to the contact.
 */
public final class PreferencesLink {

  private String object;
  private String contact;
  private String url;

  public String getObject() {
    return object;
  }

  /** The contact id, also when the link was requested by email. */
  public String getContact() {
    return contact;
  }

  public String getUrl() {
    return url;
  }
}

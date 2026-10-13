package com.millionsend.model;

import java.util.List;

/**
 * Response from {@code contacts().batch().get(...)}: the contacts found, in
 * request order, and the request entries that matched no contact.
 */
public final class BatchGetContactsResponse {

  private String object;
  private List<Contact> data;
  private List<Missing> missing;

  public String getObject() {
    return object;
  }

  /** The contacts found, in request order, with the facets {@code include} asked for. */
  public List<Contact> getData() {
    return data;
  }

  /** Request entries that matched no contact. */
  public List<Missing> getMissing() {
    return missing;
  }

  public static final class Missing {
    private int index;
    private String id;
    private String email;

    /** Position of the entry in the request array. */
    public int getIndex() {
      return index;
    }

    public String getId() {
      return id;
    }

    public String getEmail() {
      return email;
    }
  }
}

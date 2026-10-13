package com.millionsend.model;

/**
 * A dynamic segment (MillionSend extension). {@code contactCount} is only
 * populated when a single segment is fetched.
 */
public final class Segment {

  private String object;
  private String id;
  private String name;
  private SegmentFilter filter;
  private String createdAt;
  private Integer contactCount;

  public String getObject() {
    return object;
  }

  public String getId() {
    return id;
  }

  public String getName() {
    return name;
  }

  public SegmentFilter getFilter() {
    return filter;
  }

  public String getCreatedAt() {
    return createdAt;
  }

  public Integer getContactCount() {
    return contactCount;
  }
}

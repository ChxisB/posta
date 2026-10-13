package com.millionsend.model;

import java.util.List;
import java.util.Map;

/**
 * A sending domain. {@code records} (the DNS records to publish) is only
 * populated when a single domain is fetched, created or verified.
 */
public final class Domain {

  private String object;
  private String id;
  private String name;
  private String status;
  private String createdAt;
  private String region;
  private boolean openTracking;
  private boolean clickTracking;
  private String trackingSubdomain;
  private Map<String, String> capabilities;
  private List<DomainRecord> records;

  public String getObject() {
    return object;
  }

  public String getId() {
    return id;
  }

  public String getName() {
    return name;
  }

  /** {@code pending}, {@code verified}, {@code failed}, … */
  public String getStatus() {
    return status;
  }

  public String getCreatedAt() {
    return createdAt;
  }

  public String getRegion() {
    return region;
  }

  public boolean isOpenTracking() {
    return openTracking;
  }

  public boolean isClickTracking() {
    return clickTracking;
  }

  public String getTrackingSubdomain() {
    return trackingSubdomain;
  }

  /** {@code sending} / {@code receiving} → {@code enabled} / {@code disabled}. */
  public Map<String, String> getCapabilities() {
    return capabilities;
  }

  public List<DomainRecord> getRecords() {
    return records;
  }
}

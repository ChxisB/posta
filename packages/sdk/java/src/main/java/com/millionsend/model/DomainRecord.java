package com.millionsend.model;

/** One DNS record a domain needs ({@link Domain#getRecords()}). */
public final class DomainRecord {

  private String record;
  private String name;
  private String type;
  private String ttl;
  private String status;
  private String value;
  private Integer priority;

  /** What the record is for: {@code SPF}, {@code DKIM}, {@code DMARC}, {@code Tracking}, … */
  public String getRecord() {
    return record;
  }

  public String getName() {
    return name;
  }

  public String getType() {
    return type;
  }

  public String getTtl() {
    return ttl;
  }

  public String getStatus() {
    return status;
  }

  public String getValue() {
    return value;
  }

  /** MX priority; {@code null} for other record types. */
  public Integer getPriority() {
    return priority;
  }
}

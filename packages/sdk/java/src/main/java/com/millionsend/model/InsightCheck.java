package com.millionsend.model;

import java.util.Map;

/**
 * One entry of {@link EmailInsights#getChecks()}. {@code id} is an open set (the
 * check catalog grows across score versions), and {@code severity}/{@code status}
 * are plain strings so a future wire value never breaks deserialization.
 */
public final class InsightCheck {

  private String id;
  private String severity;
  private String status;
  private double penalty;
  private Map<String, Object> detail;

  public String getId() {
    return id;
  }

  /** {@code critical}, {@code major}, {@code minor}, {@code info}, or a future value. */
  public String getSeverity() {
    return severity;
  }

  /**
   * {@code pass}, {@code fail}, {@code passed_by_design}, {@code not_applicable},
   * {@code unknown}, or a future value.
   */
  public String getStatus() {
    return status;
  }

  /** Points deducted from the score; 0 unless status is {@code fail}. */
  public double getPenalty() {
    return penalty;
  }

  /** Free-form JSON detail, or {@code null} when the check carries none. */
  public Map<String, Object> getDetail() {
    return detail;
  }
}

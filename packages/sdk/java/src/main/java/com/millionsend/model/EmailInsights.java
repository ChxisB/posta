package com.millionsend.model;

import java.util.List;

/** The pre-send best-practice report ({@code emails().getInsights(...)}). */
public final class EmailInsights {

  private String object;
  private String emailId;
  private double score;
  private int scoreVersion;
  private String band;
  private boolean marketing;
  private Integer htmlSizeBytes;
  private String computedAt;
  private List<InsightCheck> checks;

  public String getObject() {
    return object;
  }

  public String getEmailId() {
    return emailId;
  }

  /** Best-practice score, 0-10, one decimal. */
  public double getScore() {
    return score;
  }

  public int getScoreVersion() {
    return scoreVersion;
  }

  /**
   * {@code excellent}, {@code good}, {@code needs_attention}, {@code at_risk},
   * or a future value.
   */
  public String getBand() {
    return band;
  }

  public boolean isMarketing() {
    return marketing;
  }

  /** Size of the rendered HTML in bytes, or {@code null} for a text-only email. */
  public Integer getHtmlSizeBytes() {
    return htmlSizeBytes;
  }

  public String getComputedAt() {
    return computedAt;
  }

  public List<InsightCheck> getChecks() {
    return checks;
  }
}

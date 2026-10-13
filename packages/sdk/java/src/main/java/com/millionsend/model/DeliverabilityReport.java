package com.millionsend.model;

/**
 * The account deliverability score over the trailing window
 * ({@code deliverability().get()}). Scores are 0-10 with one decimal;
 * {@code null} means not enough data to compute.
 */
public final class DeliverabilityReport {

  private String object;
  private Double score;
  private String band;
  private Double contentScore;
  private Double outcomeScore;
  private double complaintRate;
  private double hardBounceRate;
  private long emailsSent;
  private long scoredRecipients;
  private int windowDays;
  private boolean insufficientOutcomeData;
  private String guardrailStatus;
  private int scoreVersion;

  public String getObject() {
    return object;
  }

  public Double getScore() {
    return score;
  }

  /**
   * {@code excellent}, {@code good}, {@code needs_attention}, {@code at_risk},
   * a future value, or {@code null} when there is no score.
   */
  public String getBand() {
    return band;
  }

  public Double getContentScore() {
    return contentScore;
  }

  public Double getOutcomeScore() {
    return outcomeScore;
  }

  public double getComplaintRate() {
    return complaintRate;
  }

  public double getHardBounceRate() {
    return hardBounceRate;
  }

  public long getEmailsSent() {
    return emailsSent;
  }

  public long getScoredRecipients() {
    return scoredRecipients;
  }

  public int getWindowDays() {
    return windowDays;
  }

  public boolean isInsufficientOutcomeData() {
    return insufficientOutcomeData;
  }

  /** {@code ok}, {@code warning}, {@code paused}, or a future value. */
  public String getGuardrailStatus() {
    return guardrailStatus;
  }

  public int getScoreVersion() {
    return scoreVersion;
  }
}

package com.millionsend.model;

/**
 * The team's plan, limits and today's send count ({@code usage().get()}).
 * MillionSend extension. Limits are {@code null} when unlimited (self-hosted).
 */
public final class UsageReport {

  private String object;
  private boolean cloud;
  private String plan;
  private Limits limits;
  private Today today;
  private Team team;
  private String appUrl;

  public String getObject() {
    return object;
  }

  /** True on MillionSend Cloud, false on a self-hosted instance. */
  public boolean isCloud() {
    return cloud;
  }

  /** {@code free}, {@code pro}, {@code scale}, or {@code null} when self-hosted. */
  public String getPlan() {
    return plan;
  }

  public Limits getLimits() {
    return limits;
  }

  public Today getToday() {
    return today;
  }

  public Team getTeam() {
    return team;
  }

  public String getAppUrl() {
    return appUrl;
  }

  public static final class Limits {
    private Integer emailsPerDay;
    private Integer domains;

    public Integer getEmailsPerDay() {
      return emailsPerDay;
    }

    public Integer getDomains() {
      return domains;
    }
  }

  public static final class Today {
    private long emailsSent;
    private String resetsAt;

    public long getEmailsSent() {
      return emailsSent;
    }

    public String getResetsAt() {
      return resetsAt;
    }
  }

  public static final class Team {
    private String id;
    private String name;

    public String getId() {
      return id;
    }

    public String getName() {
      return name;
    }
  }
}

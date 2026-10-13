package com.millionsend.model;

import com.fasterxml.jackson.annotation.JsonInclude;

/** Options for {@code domains().create(...)}. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class CreateDomainOptions {

  private String name;
  private String region;
  private String customReturnPath;
  private Boolean openTracking;
  private Boolean clickTracking;
  private String trackingSubdomain;

  private CreateDomainOptions() {}

  public static Builder builder() {
    return new Builder();
  }

  public static final class Builder {
    private final CreateDomainOptions o = new CreateDomainOptions();

    public Builder name(String name) {
      o.name = name;
      return this;
    }

    /** SES region, e.g. {@code us-east-1}; omit to use the deployment's region. */
    public Builder region(String region) {
      o.region = region;
      return this;
    }

    /** Return-path DNS label (server default {@code send}). */
    public Builder customReturnPath(String customReturnPath) {
      o.customReturnPath = customReturnPath;
      return this;
    }

    public Builder openTracking(boolean openTracking) {
      o.openTracking = openTracking;
      return this;
    }

    public Builder clickTracking(boolean clickTracking) {
      o.clickTracking = clickTracking;
      return this;
    }

    /** DNS label of the branded tracking host, e.g. {@code links}. */
    public Builder trackingSubdomain(String trackingSubdomain) {
      o.trackingSubdomain = trackingSubdomain;
      return this;
    }

    public CreateDomainOptions build() {
      return o;
    }
  }
}

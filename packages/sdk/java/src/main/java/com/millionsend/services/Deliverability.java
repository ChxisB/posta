package com.millionsend.services;

import com.fasterxml.jackson.core.type.TypeReference;
import com.millionsend.MillionSendException;
import com.millionsend.core.HttpClient;
import com.millionsend.model.DeliverabilityReport;

/** The {@code deliverability} resource: the account-level score. */
public final class Deliverability {

  private final HttpClient http;

  public Deliverability(HttpClient http) {
    this.http = http;
  }

  /** GET /deliverability */
  public DeliverabilityReport get() throws MillionSendException {
    return http.request(
        "GET", "/deliverability", null, null, null, new TypeReference<DeliverabilityReport>() {});
  }
}

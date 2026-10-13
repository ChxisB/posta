package com.millionsend.services;

import com.fasterxml.jackson.core.type.TypeReference;
import com.millionsend.MillionSendException;
import com.millionsend.core.HttpClient;
import com.millionsend.model.UsageReport;

/** The {@code usage} resource (MillionSend extension): plan, limits and today's send count. */
public final class Usage {

  private final HttpClient http;

  public Usage(HttpClient http) {
    this.http = http;
  }

  /** GET /usage */
  public UsageReport get() throws MillionSendException {
    return http.request("GET", "/usage", null, null, null, new TypeReference<UsageReport>() {});
  }
}

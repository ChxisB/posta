package io.github.tacklabs.posta.services;

import com.fasterxml.jackson.core.type.TypeReference;
import io.github.tacklabs.posta.PostaException;
import io.github.tacklabs.posta.core.HttpClient;
import io.github.tacklabs.posta.model.UsageReport;

/** The {@code usage} resource (Posta extension): plan, limits and today's send count. */
public final class Usage {

  private final HttpClient http;

  public Usage(HttpClient http) {
    this.http = http;
  }

  /** GET /usage */
  public UsageReport get() throws PostaException {
    return http.request("GET", "/usage", null, null, null, new TypeReference<UsageReport>() {});
  }
}

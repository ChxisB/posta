package io.github.tacklabs.posta.services;

import com.fasterxml.jackson.core.type.TypeReference;
import io.github.tacklabs.posta.PostaException;
import io.github.tacklabs.posta.core.HttpClient;
import io.github.tacklabs.posta.model.DeliverabilityReport;

/** The {@code deliverability} resource: the account-level score. */
public final class Deliverability {

  private final HttpClient http;

  public Deliverability(HttpClient http) {
    this.http = http;
  }

  /** GET /deliverability */
  public DeliverabilityReport get() throws PostaException {
    return http.request(
        "GET", "/deliverability", null, null, null, new TypeReference<DeliverabilityReport>() {});
  }
}

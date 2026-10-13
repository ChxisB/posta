package io.github.tacklabs.posta.services;

import static io.github.tacklabs.posta.core.HttpClient.enc;

import com.fasterxml.jackson.core.type.TypeReference;
import io.github.tacklabs.posta.PostaException;
import io.github.tacklabs.posta.core.HttpClient;
import io.github.tacklabs.posta.model.CreateDomainOptions;
import io.github.tacklabs.posta.model.DeletedResponse;
import io.github.tacklabs.posta.model.Domain;
import io.github.tacklabs.posta.model.ListOptions;
import io.github.tacklabs.posta.model.ListResponse;
import io.github.tacklabs.posta.model.UpdateDomainOptions;

/** The {@code domains} resource: create, get, list, verify, update, remove. */
public final class Domains {

  private final HttpClient http;

  public Domains(HttpClient http) {
    this.http = http;
  }

  /** POST /domains — returns the domain with the DNS {@code records} to publish. */
  public Domain create(CreateDomainOptions options) throws PostaException {
    return http.request("POST", "/domains", options, null, null, new TypeReference<Domain>() {});
  }

  /** GET /domains/{id} */
  public Domain get(String id) throws PostaException {
    return http.request(
        "GET", "/domains/" + enc(id), null, null, null, new TypeReference<Domain>() {});
  }

  /** GET /domains */
  public ListResponse<Domain> list() throws PostaException {
    return list(null);
  }

  /** GET /domains with pagination. */
  public ListResponse<Domain> list(ListOptions options) throws PostaException {
    return http.request(
        "GET", "/domains", null, options == null ? null : options.toQuery(), null,
        new TypeReference<ListResponse<Domain>>() {});
  }

  /** POST /domains/{id}/verify — re-checks DNS and returns the refreshed domain. */
  public Domain verify(String id) throws PostaException {
    return http.request(
        "POST", "/domains/" + enc(id) + "/verify", null, null, null,
        new TypeReference<Domain>() {});
  }

  /** PATCH /domains/{id} — tracking settings. Only the fields set on {@code options} are sent. */
  public Domain update(UpdateDomainOptions options) throws PostaException {
    return http.request(
        "PATCH", "/domains/" + enc(options.getId()), options.getChanges(), null, null,
        new TypeReference<Domain>() {});
  }

  /** DELETE /domains/{id} */
  public DeletedResponse remove(String id) throws PostaException {
    return http.request(
        "DELETE", "/domains/" + enc(id), null, null, null,
        new TypeReference<DeletedResponse>() {});
  }
}

package com.millionsend.services;

import static com.millionsend.core.HttpClient.enc;

import com.fasterxml.jackson.core.type.TypeReference;
import com.millionsend.MillionSendException;
import com.millionsend.core.HttpClient;
import com.millionsend.model.CreateTemplateOptions;
import com.millionsend.model.DeletedResponse;
import com.millionsend.model.Id;
import com.millionsend.model.ListOptions;
import com.millionsend.model.ListResponse;
import com.millionsend.model.Template;
import com.millionsend.model.UpdateTemplateOptions;

/**
 * The {@code templates} resource. Every method taking an identifier accepts the
 * template id or its alias.
 */
public final class Templates {

  private final HttpClient http;

  public Templates(HttpClient http) {
    this.http = http;
  }

  /** POST /templates — 409 {@code validation_error} when the alias is taken. */
  public Id create(CreateTemplateOptions options) throws MillionSendException {
    return http.request("POST", "/templates", options, null, null, new TypeReference<Id>() {});
  }

  /** GET /templates/{idOrAlias} */
  public Template get(String idOrAlias) throws MillionSendException {
    return http.request(
        "GET", "/templates/" + enc(idOrAlias), null, null, null,
        new TypeReference<Template>() {});
  }

  /** GET /templates */
  public ListResponse<Template> list() throws MillionSendException {
    return list(null);
  }

  /** GET /templates with pagination. */
  public ListResponse<Template> list(ListOptions options) throws MillionSendException {
    return http.request(
        "GET", "/templates", null, options == null ? null : options.toQuery(), null,
        new TypeReference<ListResponse<Template>>() {});
  }

  /** PATCH /templates/{idOrAlias}. Only the fields set on {@code options} are sent (null clears). */
  public Id update(String idOrAlias, UpdateTemplateOptions options) throws MillionSendException {
    return http.request(
        "PATCH", "/templates/" + enc(idOrAlias), options.getChanges(), null, null,
        new TypeReference<Id>() {});
  }

  /** DELETE /templates/{idOrAlias} */
  public DeletedResponse remove(String idOrAlias) throws MillionSendException {
    return http.request(
        "DELETE", "/templates/" + enc(idOrAlias), null, null, null,
        new TypeReference<DeletedResponse>() {});
  }

  /** POST /templates/{idOrAlias}/publish — a no-op acknowledgement: every save is already live. */
  public Id publish(String idOrAlias) throws MillionSendException {
    return http.request(
        "POST", "/templates/" + enc(idOrAlias) + "/publish", null, null, null,
        new TypeReference<Id>() {});
  }

  /** POST /templates/{idOrAlias}/duplicate — a copy named "&lt;name&gt; (copy)" with no alias. */
  public Id duplicate(String idOrAlias) throws MillionSendException {
    return http.request(
        "POST", "/templates/" + enc(idOrAlias) + "/duplicate", null, null, null,
        new TypeReference<Id>() {});
  }
}

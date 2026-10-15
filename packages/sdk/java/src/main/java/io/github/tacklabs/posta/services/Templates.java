package io.github.tacklabs.posta.services;

import static io.github.tacklabs.posta.core.HttpClient.enc;

import com.fasterxml.jackson.core.type.TypeReference;
import io.github.tacklabs.posta.PostaException;
import io.github.tacklabs.posta.core.HttpClient;
import io.github.tacklabs.posta.model.CreateTemplateOptions;
import io.github.tacklabs.posta.model.DeletedResponse;
import io.github.tacklabs.posta.model.Id;
import io.github.tacklabs.posta.model.ListOptions;
import io.github.tacklabs.posta.model.ListResponse;
import io.github.tacklabs.posta.model.Template;
import io.github.tacklabs.posta.model.UpdateTemplateOptions;

/**
 * The {@code templates} resource. Every method taking an identifier accepts the
 * template id or its alias.
 */
public final class Templates {

  private final HttpClient http;

  public Templates(HttpClient http) {
    this.http = http;
  }

  /** POST /templates: 409 {@code validation_error} when the alias is taken. */
  public Id create(CreateTemplateOptions options) throws PostaException {
    return http.request("POST", "/templates", options, null, null, new TypeReference<Id>() {});
  }

  /** GET /templates/{idOrAlias} */
  public Template get(String idOrAlias) throws PostaException {
    return http.request(
        "GET", "/templates/" + enc(idOrAlias), null, null, null,
        new TypeReference<Template>() {});
  }

  /** GET /templates */
  public ListResponse<Template> list() throws PostaException {
    return list(null);
  }

  /** GET /templates with pagination. */
  public ListResponse<Template> list(ListOptions options) throws PostaException {
    return http.request(
        "GET", "/templates", null, options == null ? null : options.toQuery(), null,
        new TypeReference<ListResponse<Template>>() {});
  }

  /** PATCH /templates/{idOrAlias}. Only the fields set on {@code options} are sent (null clears). */
  public Id update(String idOrAlias, UpdateTemplateOptions options) throws PostaException {
    return http.request(
        "PATCH", "/templates/" + enc(idOrAlias), options.getChanges(), null, null,
        new TypeReference<Id>() {});
  }

  /** DELETE /templates/{idOrAlias} */
  public DeletedResponse remove(String idOrAlias) throws PostaException {
    return http.request(
        "DELETE", "/templates/" + enc(idOrAlias), null, null, null,
        new TypeReference<DeletedResponse>() {});
  }

  /** POST /templates/{idOrAlias}/publish: a no-op acknowledgement: every save is already live. */
  public Id publish(String idOrAlias) throws PostaException {
    return http.request(
        "POST", "/templates/" + enc(idOrAlias) + "/publish", null, null, null,
        new TypeReference<Id>() {});
  }

  /** POST /templates/{idOrAlias}/duplicate: a copy named "&lt;name&gt; (copy)" with no alias. */
  public Id duplicate(String idOrAlias) throws PostaException {
    return http.request(
        "POST", "/templates/" + enc(idOrAlias) + "/duplicate", null, null, null,
        new TypeReference<Id>() {});
  }
}

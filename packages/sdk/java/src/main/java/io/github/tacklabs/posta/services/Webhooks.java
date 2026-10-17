package io.github.tacklabs.posta.services;

import static io.github.tacklabs.posta.core.HttpClient.enc;

import com.fasterxml.jackson.core.type.TypeReference;
import io.github.tacklabs.posta.PostaException;
import io.github.tacklabs.posta.core.HttpClient;
import io.github.tacklabs.posta.model.CreateWebhookOptions;
import io.github.tacklabs.posta.model.CreateWebhookResponse;
import io.github.tacklabs.posta.model.DeletedResponse;
import io.github.tacklabs.posta.model.Id;
import io.github.tacklabs.posta.model.ListOptions;
import io.github.tacklabs.posta.model.ListResponse;
import io.github.tacklabs.posta.model.RotateWebhookOptions;
import io.github.tacklabs.posta.model.RotateWebhookResponse;
import io.github.tacklabs.posta.model.UpdateWebhookOptions;
import io.github.tacklabs.posta.model.Webhook;
import java.util.Collections;

/** The {@code webhooks} resource: create, get, list, update, rotate, remove. */
public final class Webhooks {

  private final HttpClient http;

  public Webhooks(HttpClient http) {
    this.http = http;
  }

  /** POST /webhooks: returns the id and the signing secret. */
  public CreateWebhookResponse create(CreateWebhookOptions options) throws PostaException {
    return http.request(
        "POST", "/webhooks", options, null, null, new TypeReference<CreateWebhookResponse>() {});
  }

  /** GET /webhooks/{id}: includes {@code signingSecret}. */
  public Webhook get(String id) throws PostaException {
    return http.request(
        "GET", "/webhooks/" + enc(id), null, null, null, new TypeReference<Webhook>() {});
  }

  /** GET /webhooks */
  public ListResponse<Webhook> list() throws PostaException {
    return list(null);
  }

  /** GET /webhooks with pagination. */
  public ListResponse<Webhook> list(ListOptions options) throws PostaException {
    return http.request(
        "GET", "/webhooks", null, options == null ? null : options.toQuery(), null,
        new TypeReference<ListResponse<Webhook>>() {});
  }

  /** PATCH /webhooks/{id} */
  public Id update(String id, UpdateWebhookOptions options) throws PostaException {
    return http.request(
        "PATCH", "/webhooks/" + enc(id), options, null, null, new TypeReference<Id>() {});
  }

  /** POST /webhooks/{id}/rotate with the server defaults: a minted secret and the default overlap. */
  public RotateWebhookResponse rotate(String id) throws PostaException {
    return rotate(id, null);
  }

  /**
   * POST /webhooks/{id}/rotate: a Posta extension. During the overlap
   * window every delivery carries both the new and the previous signature.
   */
  public RotateWebhookResponse rotate(String id, RotateWebhookOptions options)
      throws PostaException {
    return http.request(
        "POST", "/webhooks/" + enc(id) + "/rotate",
        options == null ? Collections.emptyMap() : options, null, null,
        new TypeReference<RotateWebhookResponse>() {});
  }

  /** DELETE /webhooks/{id} */
  public DeletedResponse remove(String id) throws PostaException {
    return http.request(
        "DELETE", "/webhooks/" + enc(id), null, null, null,
        new TypeReference<DeletedResponse>() {});
  }
}

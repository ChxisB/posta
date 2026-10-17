package io.github.tacklabs.posta.services;

import static io.github.tacklabs.posta.core.HttpClient.enc;

import com.fasterxml.jackson.core.type.TypeReference;
import io.github.tacklabs.posta.PostaException;
import io.github.tacklabs.posta.core.HttpClient;
import io.github.tacklabs.posta.model.Broadcast;
import io.github.tacklabs.posta.model.CreateBroadcastOptions;
import io.github.tacklabs.posta.model.DeletedResponse;
import io.github.tacklabs.posta.model.Id;
import io.github.tacklabs.posta.model.ListOptions;
import io.github.tacklabs.posta.model.ListResponse;
import io.github.tacklabs.posta.model.SendBroadcastOptions;
import io.github.tacklabs.posta.model.UpdateBroadcastOptions;

/** The {@code broadcasts} resource: create, get, list, update, remove, send, cancel. */
public final class Broadcasts {

  private final HttpClient http;

  public Broadcasts(HttpClient http) {
    this.http = http;
  }

  /** POST /broadcasts */
  public Id create(CreateBroadcastOptions options) throws PostaException {
    return http.request("POST", "/broadcasts", options, null, null, new TypeReference<Id>() {});
  }

  /** GET /broadcasts/{id} */
  public Broadcast get(String id) throws PostaException {
    return http.request(
        "GET", "/broadcasts/" + enc(id), null, null, null, new TypeReference<Broadcast>() {});
  }

  /** GET /broadcasts */
  public ListResponse<Broadcast> list() throws PostaException {
    return list(null);
  }

  /** GET /broadcasts with pagination. */
  public ListResponse<Broadcast> list(ListOptions options) throws PostaException {
    return http.request(
        "GET", "/broadcasts", null, options == null ? null : options.toQuery(), null,
        new TypeReference<ListResponse<Broadcast>>() {});
  }

  /** PATCH /broadcasts/{id}: draft only. Only the fields set on {@code options} are sent. */
  public Id update(String id, UpdateBroadcastOptions options) throws PostaException {
    return http.request(
        "PATCH", "/broadcasts/" + enc(id), options.getChanges(), null, null,
        new TypeReference<Id>() {});
  }

  /** DELETE /broadcasts/{id}: draft only. */
  public DeletedResponse remove(String id) throws PostaException {
    return http.request(
        "DELETE", "/broadcasts/" + enc(id), null, null, null,
        new TypeReference<DeletedResponse>() {});
  }

  /** POST /broadcasts/{id}/send: send now. */
  public Id send(String id) throws PostaException {
    return send(id, new SendBroadcastOptions());
  }

  /** POST /broadcasts/{id}/send: omit {@code scheduledAt} on the options to send now. */
  public Id send(String id, SendBroadcastOptions options) throws PostaException {
    return http.request(
        "POST", "/broadcasts/" + enc(id) + "/send", options, null, null, new TypeReference<Id>() {});
  }

  /** POST /broadcasts/{id}/cancel: scheduled only. */
  public DeletedResponse cancel(String id) throws PostaException {
    return http.request(
        "POST", "/broadcasts/" + enc(id) + "/cancel", null, null, null,
        new TypeReference<DeletedResponse>() {});
  }
}

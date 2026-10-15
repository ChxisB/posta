package io.github.tacklabs.posta.services;

import static io.github.tacklabs.posta.core.HttpClient.enc;

import com.fasterxml.jackson.core.type.TypeReference;
import io.github.tacklabs.posta.PostaException;
import io.github.tacklabs.posta.core.HttpClient;
import io.github.tacklabs.posta.model.CreateTopicOptions;
import io.github.tacklabs.posta.model.DataResponse;
import io.github.tacklabs.posta.model.DeletedResponse;
import io.github.tacklabs.posta.model.Id;
import io.github.tacklabs.posta.model.Topic;
import io.github.tacklabs.posta.model.UpdateTopicOptions;

/** The {@code topics} resource: create, get, list, update, remove. */
public final class Topics {

  private final HttpClient http;

  public Topics(HttpClient http) {
    this.http = http;
  }

  /** POST /topics */
  public Id create(CreateTopicOptions options) throws PostaException {
    return http.request("POST", "/topics", options, null, null, new TypeReference<Id>() {});
  }

  /** GET /topics/{id} */
  public Topic get(String id) throws PostaException {
    return http.request("GET", "/topics/" + enc(id), null, null, null, new TypeReference<Topic>() {});
  }

  /** GET /topics: a bare {@code { data }} list (topics are unpaginated). */
  public DataResponse<Topic> list() throws PostaException {
    return http.request("GET", "/topics", null, null, null, new TypeReference<DataResponse<Topic>>() {});
  }

  /** PATCH /topics/{id}: name, description, visibility. */
  public Id update(String id, UpdateTopicOptions options) throws PostaException {
    return http.request(
        "PATCH", "/topics/" + enc(id), options, null, null, new TypeReference<Id>() {});
  }

  /** DELETE /topics/{id} */
  public DeletedResponse remove(String id) throws PostaException {
    return http.request(
        "DELETE", "/topics/" + enc(id), null, null, null, new TypeReference<DeletedResponse>() {});
  }
}

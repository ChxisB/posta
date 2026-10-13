package com.millionsend.services;

import static com.millionsend.core.HttpClient.enc;

import com.fasterxml.jackson.core.type.TypeReference;
import com.millionsend.MillionSendException;
import com.millionsend.core.HttpClient;
import com.millionsend.model.CreateTopicOptions;
import com.millionsend.model.DataResponse;
import com.millionsend.model.DeletedResponse;
import com.millionsend.model.Id;
import com.millionsend.model.Topic;
import com.millionsend.model.UpdateTopicOptions;

/** The {@code topics} resource: create, get, list, update, remove. */
public final class Topics {

  private final HttpClient http;

  public Topics(HttpClient http) {
    this.http = http;
  }

  /** POST /topics */
  public Id create(CreateTopicOptions options) throws MillionSendException {
    return http.request("POST", "/topics", options, null, null, new TypeReference<Id>() {});
  }

  /** GET /topics/{id} */
  public Topic get(String id) throws MillionSendException {
    return http.request("GET", "/topics/" + enc(id), null, null, null, new TypeReference<Topic>() {});
  }

  /** GET /topics — a bare {@code { data }} list (topics are unpaginated). */
  public DataResponse<Topic> list() throws MillionSendException {
    return http.request("GET", "/topics", null, null, null, new TypeReference<DataResponse<Topic>>() {});
  }

  /** PATCH /topics/{id} — name, description, visibility. */
  public Id update(String id, UpdateTopicOptions options) throws MillionSendException {
    return http.request(
        "PATCH", "/topics/" + enc(id), options, null, null, new TypeReference<Id>() {});
  }

  /** DELETE /topics/{id} */
  public DeletedResponse remove(String id) throws MillionSendException {
    return http.request(
        "DELETE", "/topics/" + enc(id), null, null, null, new TypeReference<DeletedResponse>() {});
  }
}

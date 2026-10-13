package com.millionsend.services;

import static com.millionsend.core.HttpClient.enc;

import com.fasterxml.jackson.core.type.TypeReference;
import com.millionsend.MillionSendException;
import com.millionsend.core.HttpClient;
import com.millionsend.model.ApiKey;
import com.millionsend.model.CreateApiKeyOptions;
import com.millionsend.model.CreateApiKeyResponse;
import com.millionsend.model.DeletedResponse;
import com.millionsend.model.ListOptions;
import com.millionsend.model.ListResponse;

/** The {@code apiKeys} resource: create, list, remove. */
public final class ApiKeys {

  private final HttpClient http;

  public ApiKeys(HttpClient http) {
    this.http = http;
  }

  /** POST /api-keys — the returned {@code token} is shown only once. */
  public CreateApiKeyResponse create(CreateApiKeyOptions options) throws MillionSendException {
    return http.request(
        "POST", "/api-keys", options, null, null, new TypeReference<CreateApiKeyResponse>() {});
  }

  /** GET /api-keys */
  public ListResponse<ApiKey> list() throws MillionSendException {
    return list(null);
  }

  /** GET /api-keys with pagination. */
  public ListResponse<ApiKey> list(ListOptions options) throws MillionSendException {
    return http.request(
        "GET", "/api-keys", null, options == null ? null : options.toQuery(), null,
        new TypeReference<ListResponse<ApiKey>>() {});
  }

  /** DELETE /api-keys/{id} */
  public DeletedResponse remove(String id) throws MillionSendException {
    return http.request(
        "DELETE", "/api-keys/" + enc(id), null, null, null,
        new TypeReference<DeletedResponse>() {});
  }
}

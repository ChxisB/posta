package com.millionsend.services;

import static com.millionsend.core.HttpClient.enc;

import com.fasterxml.jackson.core.type.TypeReference;
import com.millionsend.MillionSendException;
import com.millionsend.core.HttpClient;
import com.millionsend.core.RequestOptions;
import com.millionsend.model.CreateEmailOptions;
import com.millionsend.model.CreateEmailResponse;
import com.millionsend.model.DeletedResponse;
import com.millionsend.model.Email;
import com.millionsend.model.EmailInsights;
import com.millionsend.model.ListOptions;
import com.millionsend.model.ListResponse;
import com.millionsend.model.UpdateEmailOptions;

/** The {@code emails} resource: send, get, list, update (reschedule), insights, cancel, remove. */
public final class Emails {

  private final HttpClient http;

  public Emails(HttpClient http) {
    this.http = http;
  }

  /** POST /emails */
  public CreateEmailResponse send(CreateEmailOptions options) throws MillionSendException {
    return send(options, (RequestOptions) null);
  }

  /** POST /emails with an {@code Idempotency-Key}. */
  public CreateEmailResponse send(CreateEmailOptions options, String idempotencyKey)
      throws MillionSendException {
    return send(options, RequestOptions.idempotencyKey(idempotencyKey));
  }

  /** POST /emails with per-request options (idempotency key, extra headers). */
  public CreateEmailResponse send(CreateEmailOptions options, RequestOptions requestOptions)
      throws MillionSendException {
    return http.request(
        "POST", "/emails", options, null, requestOptions,
        new TypeReference<CreateEmailResponse>() {});
  }

  /** Alias of {@link #send(CreateEmailOptions)}, mirroring Resend. */
  public CreateEmailResponse create(CreateEmailOptions options) throws MillionSendException {
    return send(options);
  }

  /** Alias of {@link #send(CreateEmailOptions, String)}, mirroring Resend. */
  public CreateEmailResponse create(CreateEmailOptions options, String idempotencyKey)
      throws MillionSendException {
    return send(options, idempotencyKey);
  }

  /** Alias of {@link #send(CreateEmailOptions, RequestOptions)}, mirroring Resend. */
  public CreateEmailResponse create(CreateEmailOptions options, RequestOptions requestOptions)
      throws MillionSendException {
    return send(options, requestOptions);
  }

  /** GET /emails/{id} */
  public Email get(String id) throws MillionSendException {
    return http.request("GET", "/emails/" + enc(id), null, null, null, new TypeReference<Email>() {});
  }

  /** GET /emails — newest first; list items carry no body, message id or score. */
  public ListResponse<Email> list() throws MillionSendException {
    return list(null);
  }

  /** GET /emails with pagination. */
  public ListResponse<Email> list(ListOptions options) throws MillionSendException {
    return http.request(
        "GET", "/emails", null, options == null ? null : options.toQuery(), null,
        new TypeReference<ListResponse<Email>>() {});
  }

  /** PATCH /emails/{id} — reschedule a scheduled, unsent email. */
  public DeletedResponse update(String id, UpdateEmailOptions options) throws MillionSendException {
    return http.request(
        "PATCH", "/emails/" + enc(id), options, null, null, new TypeReference<DeletedResponse>() {});
  }

  /**
   * GET /emails/{id}/insights — the pre-send best-practice report. The API
   * returns a 404 {@code not_found} when the id is unknown or insights are not
   * available for the email yet.
   */
  public EmailInsights getInsights(String id) throws MillionSendException {
    return http.request(
        "GET", "/emails/" + enc(id) + "/insights", null, null, null,
        new TypeReference<EmailInsights>() {});
  }

  /** POST /emails/{id}/cancel — scheduled, unsent emails only. */
  public DeletedResponse cancel(String id) throws MillionSendException {
    return http.request(
        "POST", "/emails/" + enc(id) + "/cancel", null, null, null,
        new TypeReference<DeletedResponse>() {});
  }

  /** DELETE /emails/{id} — hard-deletes the email and its events (MillionSend extension). */
  public DeletedResponse remove(String id) throws MillionSendException {
    return http.request(
        "DELETE", "/emails/" + enc(id), null, null, null, new TypeReference<DeletedResponse>() {});
  }
}

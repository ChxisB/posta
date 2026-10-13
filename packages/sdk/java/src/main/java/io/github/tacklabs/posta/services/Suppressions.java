package io.github.tacklabs.posta.services;

import static io.github.tacklabs.posta.core.HttpClient.enc;

import com.fasterxml.jackson.core.type.TypeReference;
import io.github.tacklabs.posta.PostaException;
import io.github.tacklabs.posta.core.HttpClient;
import io.github.tacklabs.posta.model.AddSuppressionOptions;
import io.github.tacklabs.posta.model.AddSuppressionsOptions;
import io.github.tacklabs.posta.model.DataResponse;
import io.github.tacklabs.posta.model.DeletedResponse;
import io.github.tacklabs.posta.model.Id;
import io.github.tacklabs.posta.model.ListResponse;
import io.github.tacklabs.posta.model.ListSuppressionsOptions;
import io.github.tacklabs.posta.model.RemoveSuppressionsOptions;
import io.github.tacklabs.posta.model.Suppression;

/**
 * The {@code suppressions} resource: addresses that never receive mail. Single
 * entries are addressed by id or by email; bulk add/remove lives under
 * {@link #batch()}.
 */
public final class Suppressions {

  private final HttpClient http;
  private final SuppressionsBatch batch;

  public Suppressions(HttpClient http) {
    this.http = http;
    this.batch = new SuppressionsBatch(http);
  }

  public SuppressionsBatch batch() {
    return batch;
  }

  /** POST /suppressions — idempotent: an already-suppressed address returns its existing id. */
  public Id add(AddSuppressionOptions options) throws PostaException {
    return http.request("POST", "/suppressions", options, null, null, new TypeReference<Id>() {});
  }

  /** Alias of {@link #add(AddSuppressionOptions)}. */
  public Id create(AddSuppressionOptions options) throws PostaException {
    return add(options);
  }

  /** GET /suppressions/{idOrEmail} */
  public Suppression get(String idOrEmail) throws PostaException {
    return http.request(
        "GET", "/suppressions/" + enc(idOrEmail), null, null, null,
        new TypeReference<Suppression>() {});
  }

  /** GET /suppressions */
  public ListResponse<Suppression> list() throws PostaException {
    return list(null);
  }

  /** GET /suppressions with pagination and an optional {@code origin} filter. */
  public ListResponse<Suppression> list(ListSuppressionsOptions options)
      throws PostaException {
    return http.request(
        "GET", "/suppressions", null, options == null ? null : options.toQuery(), null,
        new TypeReference<ListResponse<Suppression>>() {});
  }

  /** DELETE /suppressions/{idOrEmail} — the address can receive mail again. */
  public DeletedResponse remove(String idOrEmail) throws PostaException {
    return http.request(
        "DELETE", "/suppressions/" + enc(idOrEmail), null, null, null,
        new TypeReference<DeletedResponse>() {});
  }

  /** Bulk suppression add/remove, up to 1000 addresses per call. */
  public static final class SuppressionsBatch {

    private final HttpClient http;

    SuppressionsBatch(HttpClient http) {
      this.http = http;
    }

    /** POST /suppressions/batch/add — one id per distinct address, in input order. */
    public DataResponse<Id> add(AddSuppressionsOptions options) throws PostaException {
      return http.request(
          "POST", "/suppressions/batch/add", options, null, null,
          new TypeReference<DataResponse<Id>>() {});
    }

    /** POST /suppressions/batch/remove — by emails or by ids; lists only the rows actually removed. */
    public DataResponse<DeletedResponse> remove(RemoveSuppressionsOptions options)
        throws PostaException {
      return http.request(
          "POST", "/suppressions/batch/remove", options, null, null,
          new TypeReference<DataResponse<DeletedResponse>>() {});
    }
  }
}

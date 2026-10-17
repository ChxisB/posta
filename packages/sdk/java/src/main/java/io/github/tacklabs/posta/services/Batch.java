package io.github.tacklabs.posta.services;

import com.fasterxml.jackson.core.type.TypeReference;
import io.github.tacklabs.posta.PostaException;
import io.github.tacklabs.posta.core.HttpClient;
import io.github.tacklabs.posta.core.RequestOptions;
import io.github.tacklabs.posta.model.CreateBatchEmailsResponse;
import io.github.tacklabs.posta.model.CreateEmailOptions;
import java.util.List;

/** The {@code batch} resource: send up to 100 emails in one call. */
public final class Batch {

  private final HttpClient http;

  public Batch(HttpClient http) {
    this.http = http;
  }

  /** POST /emails/batch */
  public CreateBatchEmailsResponse send(List<CreateEmailOptions> emails)
      throws PostaException {
    return send(emails, (RequestOptions) null);
  }

  /** POST /emails/batch with an {@code Idempotency-Key}. */
  public CreateBatchEmailsResponse send(List<CreateEmailOptions> emails, String idempotencyKey)
      throws PostaException {
    return send(emails, RequestOptions.idempotencyKey(idempotencyKey));
  }

  /**
   * POST /emails/batch with per-request options: an idempotency key and/or the
   * {@code x-batch-validation} mode ({@code RequestOptions.builder().batchValidation(...)}).
   */
  public CreateBatchEmailsResponse send(
      List<CreateEmailOptions> emails, RequestOptions requestOptions) throws PostaException {
    return http.request(
        "POST", "/emails/batch", emails, null, requestOptions,
        new TypeReference<CreateBatchEmailsResponse>() {});
  }

  /** Alias of {@link #send(List)}, mirroring Resend. */
  public CreateBatchEmailsResponse create(List<CreateEmailOptions> emails)
      throws PostaException {
    return send(emails);
  }

  /** Alias of {@link #send(List, RequestOptions)}, mirroring Resend. */
  public CreateBatchEmailsResponse create(
      List<CreateEmailOptions> emails, RequestOptions requestOptions) throws PostaException {
    return send(emails, requestOptions);
  }
}

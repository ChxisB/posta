package com.millionsend.core;

import com.millionsend.model.BatchValidation;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Per-request options: an {@code Idempotency-Key}, the {@code x-batch-validation}
 * mode for the batch endpoints, and any extra headers.
 *
 * <pre>{@code
 * RequestOptions.builder()
 *     .idempotencyKey("order-123")
 *     .batchValidation(BatchValidation.PERMISSIVE)
 *     .build()
 * }</pre>
 */
public final class RequestOptions {

  private String idempotencyKey;
  private BatchValidation batchValidation;
  private final Map<String, String> additionalHeaders = new LinkedHashMap<>();

  private RequestOptions() {}

  public static Builder builder() {
    return new Builder();
  }

  /** Shorthand for an options object carrying only an idempotency key. */
  public static RequestOptions idempotencyKey(String idempotencyKey) {
    return builder().idempotencyKey(idempotencyKey).build();
  }

  public String getIdempotencyKey() {
    return idempotencyKey;
  }

  public BatchValidation getBatchValidation() {
    return batchValidation;
  }

  public Map<String, String> getAdditionalHeaders() {
    return additionalHeaders;
  }

  public static final class Builder {
    private final RequestOptions o = new RequestOptions();

    public Builder idempotencyKey(String idempotencyKey) {
      o.idempotencyKey = idempotencyKey;
      return this;
    }

    /** Alias of {@link #idempotencyKey(String)}, mirroring Resend. */
    public Builder setIdempotencyKey(String idempotencyKey) {
      return idempotencyKey(idempotencyKey);
    }

    /** Sent as {@code x-batch-validation} on the batch endpoints. */
    public Builder batchValidation(BatchValidation batchValidation) {
      o.batchValidation = batchValidation;
      return this;
    }

    public Builder add(String name, String value) {
      o.additionalHeaders.put(name, value);
      return this;
    }

    public Builder addAll(Map<String, String> headers) {
      o.additionalHeaders.putAll(headers);
      return this;
    }

    public RequestOptions build() {
      return o;
    }
  }
}

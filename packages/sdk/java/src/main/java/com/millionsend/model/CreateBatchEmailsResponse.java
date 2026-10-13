package com.millionsend.model;

import java.util.List;

/**
 * Response from {@code batch().send(...)}: the accepted ids in {@code data} and,
 * in {@link BatchValidation#PERMISSIVE} mode, the rejected items in {@code errors}.
 */
public final class CreateBatchEmailsResponse extends DataResponse<CreateEmailResponse> {

  private List<BatchError> errors;

  /** Rejected items (permissive mode); {@code null} when the batch was fully accepted. */
  public List<BatchError> getErrors() {
    return errors;
  }
}

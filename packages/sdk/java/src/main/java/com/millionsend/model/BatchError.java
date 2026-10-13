package com.millionsend.model;

/** One rejected item of a permissive-mode batch: its index in the request and the reason. */
public final class BatchError {

  private int index;
  private String message;

  public int getIndex() {
    return index;
  }

  public String getMessage() {
    return message;
  }
}

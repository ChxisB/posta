package com.millionsend.model;

import java.util.List;

/**
 * Response from {@code contacts().batch().create(...)}: one {@link Item} per
 * accepted contact, the per-status {@link Counts}, and (permissive mode) the
 * rejected items in {@code errors}.
 */
public final class CreateBatchContactsResponse {

  private List<Item> data;
  private Counts counts;
  private List<BatchError> errors;

  public List<Item> getData() {
    return data;
  }

  public Counts getCounts() {
    return counts;
  }

  /** Rejected items (permissive mode); {@code null} when the batch was fully accepted. */
  public List<BatchError> getErrors() {
    return errors;
  }

  public static final class Item {
    private String object;
    private int index;
    private String id;
    private String status;

    public String getObject() {
      return object;
    }

    /** Position of the item in the request array. */
    public int getIndex() {
      return index;
    }

    public String getId() {
      return id;
    }

    /** {@code created}, {@code updated} or {@code skipped}. */
    public String getStatus() {
      return status;
    }
  }

  public static final class Counts {
    private int created;
    private int updated;
    private int skipped;
    private int failed;

    public int getCreated() {
      return created;
    }

    public int getUpdated() {
      return updated;
    }

    public int getSkipped() {
      return skipped;
    }

    public int getFailed() {
      return failed;
    }
  }
}

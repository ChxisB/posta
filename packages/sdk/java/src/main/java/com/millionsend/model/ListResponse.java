package com.millionsend.model;

import java.util.List;

/** The paginated list envelope {@code { object: "list", data, has_more }}. */
public final class ListResponse<T> {

  private String object;
  private List<T> data;
  private boolean hasMore;

  public String getObject() {
    return object;
  }

  public List<T> getData() {
    return data;
  }

  public boolean isHasMore() {
    return hasMore;
  }
}

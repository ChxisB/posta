package com.millionsend.model;

import java.util.List;

/** A bare {@code { data }} envelope — batch results and the unpaginated topics list. */
public class DataResponse<T> {

  private List<T> data;

  public List<T> getData() {
    return data;
  }
}

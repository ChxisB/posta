package com.millionsend.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/** An email attachment: base64 {@code content} or a remote {@code path}, plus a file name. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class Attachment {

  @JsonProperty("filename")
  private String fileName;

  private String content;
  private String path;
  private String contentType;
  private String contentId;

  private Attachment() {}

  public static Builder builder() {
    return new Builder();
  }

  public static final class Builder {
    private final Attachment o = new Attachment();

    public Builder fileName(String fileName) {
      o.fileName = fileName;
      return this;
    }

    /** Base64-encoded file content. */
    public Builder content(String content) {
      o.content = content;
      return this;
    }

    /** URL the server fetches the file from, instead of {@code content}. */
    public Builder path(String path) {
      o.path = path;
      return this;
    }

    public Builder contentType(String contentType) {
      o.contentType = contentType;
      return this;
    }

    /** Content-ID for inline images ({@code <img src="cid:...">}). */
    public Builder contentId(String contentId) {
      o.contentId = contentId;
      return this;
    }

    public Attachment build() {
      return o;
    }
  }
}

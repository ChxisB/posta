package com.millionsend.model;

import java.util.List;

/**
 * An email template. Also used for template list items — the content fields
 * ({@code html}, {@code text}, {@code subject}, …) are only populated when a
 * single template is fetched. Templates have no draft/publish cycle here:
 * every save is live and {@code status} is always {@code published}.
 */
public final class Template {

  private String object;
  private String id;
  private String name;
  private String alias;
  private String status;
  private String publishedAt;
  private String createdAt;
  private String updatedAt;
  private String currentVersionId;
  private Object from;
  private String subject;
  private Object replyTo;
  private String html;
  private String text;
  private List<Object> variables;
  private boolean hasUnpublishedVersions;

  public String getObject() {
    return object;
  }

  public String getId() {
    return id;
  }

  public String getName() {
    return name;
  }

  public String getAlias() {
    return alias;
  }

  public String getStatus() {
    return status;
  }

  public String getPublishedAt() {
    return publishedAt;
  }

  public String getCreatedAt() {
    return createdAt;
  }

  public String getUpdatedAt() {
    return updatedAt;
  }

  public String getCurrentVersionId() {
    return currentVersionId;
  }

  /** Not supported yet: always {@code null}. */
  public Object getFrom() {
    return from;
  }

  public String getSubject() {
    return subject;
  }

  /** Not supported yet: always {@code null}. */
  public Object getReplyTo() {
    return replyTo;
  }

  public String getHtml() {
    return html;
  }

  public String getText() {
    return text;
  }

  /** Not supported yet: always empty. */
  public List<Object> getVariables() {
    return variables;
  }

  public boolean isHasUnpublishedVersions() {
    return hasUnpublishedVersions;
  }
}

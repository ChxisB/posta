package com.millionsend.model;

import java.util.List;

/**
 * A broadcast. Also used for broadcast list items — the content fields
 * ({@code from}, {@code subject}, {@code html}, …) are only populated when a
 * single broadcast is fetched.
 */
public final class Broadcast {

  private String object;
  private String id;
  private String name;
  private String segmentId;
  private String status;
  private String createdAt;
  private String scheduledAt;
  private String sentAt;
  private String from;
  private String subject;
  private List<String> replyTo;
  private String previewText;
  private String topicId;
  private String html;
  private String text;

  public String getObject() {
    return object;
  }

  public String getId() {
    return id;
  }

  public String getName() {
    return name;
  }

  public String getSegmentId() {
    return segmentId;
  }

  public String getStatus() {
    return status;
  }

  public String getCreatedAt() {
    return createdAt;
  }

  public String getScheduledAt() {
    return scheduledAt;
  }

  public String getSentAt() {
    return sentAt;
  }

  public String getFrom() {
    return from;
  }

  public String getSubject() {
    return subject;
  }

  public List<String> getReplyTo() {
    return replyTo;
  }

  public String getPreviewText() {
    return previewText;
  }

  public String getTopicId() {
    return topicId;
  }

  public String getHtml() {
    return html;
  }

  public String getText() {
    return text;
  }
}

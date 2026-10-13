package com.millionsend.model;

import java.util.List;

/** A retrieved email ({@code emails().get(...)}). */
public final class Email {

  private String object;
  private String id;
  private String from;
  private List<String> to;
  private List<String> cc;
  private List<String> bcc;
  private List<String> replyTo;
  private String subject;
  private String html;
  private String text;
  private String createdAt;
  private String scheduledAt;
  private String messageId;
  private String lastEvent;
  private Double score;

  public String getObject() {
    return object;
  }

  public String getId() {
    return id;
  }

  public String getFrom() {
    return from;
  }

  public List<String> getTo() {
    return to;
  }

  public List<String> getCc() {
    return cc;
  }

  public List<String> getBcc() {
    return bcc;
  }

  public List<String> getReplyTo() {
    return replyTo;
  }

  public String getSubject() {
    return subject;
  }

  public String getHtml() {
    return html;
  }

  public String getText() {
    return text;
  }

  public String getCreatedAt() {
    return createdAt;
  }

  public String getScheduledAt() {
    return scheduledAt;
  }

  public String getMessageId() {
    return messageId;
  }

  public String getLastEvent() {
    return lastEvent;
  }

  /** Best-practice score (0-10, one decimal), or {@code null} when the email has no insights. */
  public Double getScore() {
    return score;
  }
}

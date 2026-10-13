package com.millionsend.model;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Options for {@code broadcasts().update(...)} — draft broadcasts only. Only the
 * fields you set are sent; {@code topicId(null)} clears the topic (an explicit
 * JSON null), while not calling it leaves it unchanged.
 */
public final class UpdateBroadcastOptions {

  private final Map<String, Object> changes = new LinkedHashMap<>();

  private UpdateBroadcastOptions() {}

  public static Builder builder() {
    return new Builder();
  }

  /** The snake_case body to PATCH — only the fields the caller set. */
  public Map<String, Object> getChanges() {
    return changes;
  }

  public static final class Builder {
    private final UpdateBroadcastOptions o = new UpdateBroadcastOptions();

    public Builder name(String name) {
      o.changes.put("name", name);
      return this;
    }

    public Builder segmentId(String segmentId) {
      o.changes.put("segment_id", segmentId);
      return this;
    }

    public Builder from(String from) {
      o.changes.put("from", from);
      return this;
    }

    public Builder subject(String subject) {
      o.changes.put("subject", subject);
      return this;
    }

    public Builder html(String html) {
      o.changes.put("html", html);
      return this;
    }

    public Builder text(String text) {
      o.changes.put("text", text);
      return this;
    }

    public Builder replyTo(String... replyTo) {
      return replyTo(Arrays.asList(replyTo));
    }

    public Builder replyTo(List<String> replyTo) {
      o.changes.put("reply_to", replyTo);
      return this;
    }

    /** Inbox preview (preheader) text. */
    public Builder previewText(String previewText) {
      o.changes.put("preview_text", previewText);
      return this;
    }

    /** {@code null} clears the topic. */
    public Builder topicId(String topicId) {
      o.changes.put("topic_id", topicId);
      return this;
    }

    public UpdateBroadcastOptions build() {
      return o;
    }
  }
}

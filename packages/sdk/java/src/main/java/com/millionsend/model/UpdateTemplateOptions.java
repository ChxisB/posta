package com.millionsend.model;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Options for {@code templates().update(...)}. Only the fields you set are
 * sent; passing {@code null} to {@link Builder#subject}, {@link Builder#text}
 * or {@link Builder#alias} clears that field (an explicit JSON null), while
 * not calling the setter leaves it unchanged.
 */
public final class UpdateTemplateOptions {

  private final Map<String, Object> changes = new LinkedHashMap<>();

  private UpdateTemplateOptions() {}

  public static Builder builder() {
    return new Builder();
  }

  /** The snake_case body to PATCH — only the fields the caller set. */
  public Map<String, Object> getChanges() {
    return changes;
  }

  public static final class Builder {
    private final UpdateTemplateOptions o = new UpdateTemplateOptions();

    public Builder name(String name) {
      o.changes.put("name", name);
      return this;
    }

    public Builder html(String html) {
      o.changes.put("html", html);
      return this;
    }

    /** {@code null} clears the subject. */
    public Builder subject(String subject) {
      o.changes.put("subject", subject);
      return this;
    }

    /** {@code null} clears the text part. */
    public Builder text(String text) {
      o.changes.put("text", text);
      return this;
    }

    /** {@code null} clears the alias. */
    public Builder alias(String alias) {
      o.changes.put("alias", alias);
      return this;
    }

    public Builder from(String from) {
      o.changes.put("from", from);
      return this;
    }

    public Builder replyTo(String... replyTo) {
      return replyTo(Arrays.asList(replyTo));
    }

    public Builder replyTo(List<String> replyTo) {
      o.changes.put("reply_to", replyTo);
      return this;
    }

    /** Resend's template variable declarations, forwarded as-is. */
    public Builder variables(List<Object> variables) {
      o.changes.put("variables", variables);
      return this;
    }

    public UpdateTemplateOptions build() {
      return o;
    }
  }
}

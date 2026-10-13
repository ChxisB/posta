package com.millionsend.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Options for {@code templates().create(...)}. {@code from}, {@code replyTo} and
 * {@code variables} are forwarded as-is; the server does not support them yet and
 * answers 422 when they are set.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class CreateTemplateOptions {

  private String name;
  private String html;
  private String subject;
  private String text;
  private String alias;
  private String from;
  private List<String> replyTo;
  private List<Object> variables;

  private CreateTemplateOptions() {}

  public static Builder builder() {
    return new Builder();
  }

  public static final class Builder {
    private final CreateTemplateOptions o = new CreateTemplateOptions();

    public Builder name(String name) {
      o.name = name;
      return this;
    }

    public Builder html(String html) {
      o.html = html;
      return this;
    }

    public Builder subject(String subject) {
      o.subject = subject;
      return this;
    }

    public Builder text(String text) {
      o.text = text;
      return this;
    }

    /** Case-sensitive handle, unique per team; {@code templates().get(alias)} resolves it. */
    public Builder alias(String alias) {
      o.alias = alias;
      return this;
    }

    public Builder from(String from) {
      o.from = from;
      return this;
    }

    public Builder replyTo(String... replyTo) {
      o.replyTo = new ArrayList<>(Arrays.asList(replyTo));
      return this;
    }

    public Builder replyTo(List<String> replyTo) {
      o.replyTo = replyTo;
      return this;
    }

    /** Resend's template variable declarations ({@code [{ key, type, fallback_value }]}), forwarded as-is. */
    public Builder variables(List<Object> variables) {
      o.variables = variables;
      return this;
    }

    public CreateTemplateOptions build() {
      return o;
    }
  }
}

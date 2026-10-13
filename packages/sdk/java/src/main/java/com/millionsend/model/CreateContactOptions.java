package com.millionsend.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/** Options for {@code contacts().create(...)} and the items of {@code contacts().batch().create(...)}. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class CreateContactOptions {

  private String email;
  private String firstName;
  private String lastName;
  private Boolean unsubscribed;
  private Map<String, Object> properties;
  private List<Map<String, String>> segments;
  private List<ContactTopicUpdate> topics;

  private CreateContactOptions() {}

  public static Builder builder() {
    return new Builder();
  }

  public static final class Builder {
    private final CreateContactOptions o = new CreateContactOptions();

    public Builder email(String email) {
      o.email = email;
      return this;
    }

    public Builder firstName(String firstName) {
      o.firstName = firstName;
      return this;
    }

    public Builder lastName(String lastName) {
      o.lastName = lastName;
      return this;
    }

    public Builder unsubscribed(boolean unsubscribed) {
      o.unsubscribed = unsubscribed;
      return this;
    }

    /** Custom properties (string or number values). */
    public Builder properties(Map<String, Object> properties) {
      o.properties = properties;
      return this;
    }

    /** Segments to add the contact to on creation. */
    public Builder segments(List<String> segmentIds) {
      o.segments = new ArrayList<>();
      for (String id : segmentIds) {
        segment(id);
      }
      return this;
    }

    public Builder segment(String segmentId) {
      if (o.segments == null) {
        o.segments = new ArrayList<>();
      }
      o.segments.add(Collections.singletonMap("id", segmentId));
      return this;
    }

    /** Initial per-topic subscription choices. */
    public Builder topics(List<ContactTopicUpdate> topics) {
      o.topics = topics;
      return this;
    }

    public Builder topic(String topicId, Subscription subscription) {
      if (o.topics == null) {
        o.topics = new ArrayList<>();
      }
      o.topics.add(new ContactTopicUpdate(topicId, subscription));
      return this;
    }

    public CreateContactOptions build() {
      return o;
    }
  }
}

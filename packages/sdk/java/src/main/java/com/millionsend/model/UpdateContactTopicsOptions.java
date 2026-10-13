package com.millionsend.model;

import java.util.ArrayList;
import java.util.List;

/**
 * Options for {@code contacts().topics().update(...)}. Addresses a contact by
 * id or email (email wins); the body is the bare array of topic updates.
 */
public final class UpdateContactTopicsOptions {

  private String id;
  private String email;
  private List<ContactTopicUpdate> topics = new ArrayList<>();

  private UpdateContactTopicsOptions() {}

  public static Builder builder() {
    return new Builder();
  }

  public String getId() {
    return id;
  }

  public String getEmail() {
    return email;
  }

  public List<ContactTopicUpdate> getTopics() {
    return topics;
  }

  public static final class Builder {
    private final UpdateContactTopicsOptions o = new UpdateContactTopicsOptions();

    public Builder id(String id) {
      o.id = id;
      return this;
    }

    public Builder email(String email) {
      o.email = email;
      return this;
    }

    public Builder topics(List<ContactTopicUpdate> topics) {
      o.topics = topics;
      return this;
    }

    public Builder topic(String topicId, Subscription subscription) {
      o.topics.add(new ContactTopicUpdate(topicId, subscription));
      return this;
    }

    public UpdateContactTopicsOptions build() {
      return o;
    }
  }
}

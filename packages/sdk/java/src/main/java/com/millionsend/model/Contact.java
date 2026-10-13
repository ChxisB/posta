package com.millionsend.model;

import java.util.List;
import java.util.Map;

/**
 * A contact. Also used for list and batch-read items — there {@code properties}
 * and {@code topics} are only populated when the call asked for them via
 * {@link ContactInclude}; a single fetch always carries {@code properties}.
 */
public final class Contact {

  private String object;
  private String id;
  private String email;
  private String firstName;
  private String lastName;
  private String createdAt;
  private boolean unsubscribed;
  private Map<String, ContactPropertyValue> properties;
  private List<ContactTopic> topics;

  public String getObject() {
    return object;
  }

  public String getId() {
    return id;
  }

  public String getEmail() {
    return email;
  }

  public String getFirstName() {
    return firstName;
  }

  public String getLastName() {
    return lastName;
  }

  public String getCreatedAt() {
    return createdAt;
  }

  public boolean isUnsubscribed() {
    return unsubscribed;
  }

  /** Custom properties keyed by property key, each with its declared type and value. */
  public Map<String, ContactPropertyValue> getProperties() {
    return properties;
  }

  /** Topic subscriptions, as {@code contacts().topics().list(...)} returns them; only with {@link ContactInclude#TOPICS}. */
  public List<ContactTopic> getTopics() {
    return topics;
  }
}

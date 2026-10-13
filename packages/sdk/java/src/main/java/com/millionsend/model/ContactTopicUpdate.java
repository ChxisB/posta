package com.millionsend.model;

import com.fasterxml.jackson.annotation.JsonInclude;

/** One entry in a contact's topic-subscription update. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class ContactTopicUpdate {

  private String id;
  private Subscription subscription;

  public ContactTopicUpdate() {}

  public ContactTopicUpdate(String id, Subscription subscription) {
    this.id = id;
    this.subscription = subscription;
  }

  public String getId() {
    return id;
  }

  public Subscription getSubscription() {
    return subscription;
  }
}

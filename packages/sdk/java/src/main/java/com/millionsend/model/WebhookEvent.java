package com.millionsend.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** An event type a webhook can subscribe to. */
public enum WebhookEvent {
  EMAIL_SENT("email.sent"),
  EMAIL_DELIVERED("email.delivered"),
  EMAIL_DELIVERY_DELAYED("email.delivery_delayed"),
  EMAIL_BOUNCED("email.bounced"),
  EMAIL_COMPLAINED("email.complained"),
  EMAIL_OPENED("email.opened"),
  EMAIL_CLICKED("email.clicked"),
  /** MillionSend extension. */
  DELIVERABILITY_WARNING("deliverability.warning"),
  /** MillionSend extension. */
  DELIVERABILITY_PAUSED("deliverability.paused"),
  /** MillionSend extension. */
  QUOTA_WARNING("quota.warning"),
  /** MillionSend extension. */
  QUOTA_REACHED("quota.reached"),
  /** MillionSend extension: sends are parked at the quota ceiling until the reset or an upgrade. */
  QUOTA_PAUSED("quota.paused"),
  CONTACT_CREATED("contact.created"),
  CONTACT_UPDATED("contact.updated"),
  CONTACT_DELETED("contact.deleted"),
  /** MillionSend extension. */
  CONTACT_UNSUBSCRIBED("contact.unsubscribed"),
  /** MillionSend extension. */
  CONTACT_RESUBSCRIBED("contact.resubscribed"),
  /** MillionSend extension. */
  CONTACT_TOPIC_OPT_IN("contact.topic_opt_in"),
  /** MillionSend extension. */
  CONTACT_TOPIC_OPT_OUT("contact.topic_opt_out"),
  /** MillionSend extension. */
  SUPPRESSION_ADDED("suppression.added"),
  /** MillionSend extension. */
  SUPPRESSION_REMOVED("suppression.removed");

  private final String value;

  WebhookEvent(String value) {
    this.value = value;
  }

  @JsonValue
  public String getValue() {
    return value;
  }

  /**
   * The server may emit event types this build does not know yet; a
   * subscription to one reads as null instead of failing the whole response.
   */
  @JsonCreator
  public static WebhookEvent fromValue(String value) {
    for (WebhookEvent e : values()) {
      if (e.value.equals(value)) {
        return e;
      }
    }
    return null;
  }
}

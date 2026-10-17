package io.github.tacklabs.posta.model;

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
  /** Posta extension. */
  DELIVERABILITY_WARNING("deliverability.warning"),
  /** Posta extension. */
  DELIVERABILITY_PAUSED("deliverability.paused"),
  /** Posta extension. */
  QUOTA_WARNING("quota.warning"),
  /** Posta extension. */
  QUOTA_REACHED("quota.reached"),
  /** Posta extension: sends are parked at the quota ceiling until the reset or an upgrade. */
  QUOTA_PAUSED("quota.paused"),
  CONTACT_CREATED("contact.created"),
  CONTACT_UPDATED("contact.updated"),
  CONTACT_DELETED("contact.deleted"),
  /** Posta extension. */
  CONTACT_UNSUBSCRIBED("contact.unsubscribed"),
  /** Posta extension. */
  CONTACT_RESUBSCRIBED("contact.resubscribed"),
  /** Posta extension. */
  CONTACT_TOPIC_OPT_IN("contact.topic_opt_in"),
  /** Posta extension. */
  CONTACT_TOPIC_OPT_OUT("contact.topic_opt_out"),
  /** Posta extension. */
  SUPPRESSION_ADDED("suppression.added"),
  /** Posta extension. */
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

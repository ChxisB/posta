package com.millionsend;

import com.millionsend.core.HttpClient;
import com.millionsend.services.ApiKeys;
import com.millionsend.services.Batch;
import com.millionsend.services.Broadcasts;
import com.millionsend.services.ContactProperties;
import com.millionsend.services.Contacts;
import com.millionsend.services.Deliverability;
import com.millionsend.services.Domains;
import com.millionsend.services.Emails;
import com.millionsend.services.Segments;
import com.millionsend.services.Suppressions;
import com.millionsend.services.Templates;
import com.millionsend.services.Topics;
import com.millionsend.services.Usage;
import com.millionsend.services.Webhooks;

/**
 * The MillionSend client. Construct once and reuse.
 *
 * <pre>{@code
 * MillionSend ms = new MillionSend("ms_123");                         // MillionSend Cloud
 * MillionSend self = new MillionSend("ms_123", "https://mail.acme.dev"); // self-hosted
 * CreateEmailResponse sent = ms.emails().send(
 *     CreateEmailOptions.builder()
 *         .from("Acme <onboarding@acme.dev>")
 *         .to("success@simulator.amazonses.com")
 *         .subject("Hello")
 *         .html("<strong>it works</strong>")
 *         .build());
 * }</pre>
 *
 * <p>Every call throws a {@link MillionSendException} on a non-2xx response (or
 * a transport failure). The API key falls back to {@code MILLIONSEND_API_KEY}
 * and the base URL to {@code MILLIONSEND_BASE_URL}, then MillionSend Cloud
 * ({@code https://api.millionsend.com}). A missing API key throws
 * {@link IllegalArgumentException} at construction.
 */
public final class MillionSend {

  private static final String DEFAULT_BASE_URL = "https://api.millionsend.com";

  private final Emails emails;
  private final Batch batch;
  private final Contacts contacts;
  private final Topics topics;
  private final Broadcasts broadcasts;
  private final Segments segments;
  private final Deliverability deliverability;
  private final Suppressions suppressions;
  private final Domains domains;
  private final Webhooks webhooks;
  private final ApiKeys apiKeys;
  private final Templates templates;
  private final ContactProperties contactProperties;
  private final Usage usage;

  /** Reads the API key from {@code MILLIONSEND_API_KEY} and the base URL from the environment. */
  public MillionSend() {
    this(null, null);
  }

  /** Uses the given API key; base URL from {@code MILLIONSEND_BASE_URL} or MillionSend Cloud. */
  public MillionSend(String apiKey) {
    this(apiKey, null);
  }

  /**
   * @param apiKey the API key, or {@code null} to read {@code MILLIONSEND_API_KEY}
   * @param baseUrl your self-hosted instance URL, or {@code null} to read
   *     {@code MILLIONSEND_BASE_URL} then fall back to MillionSend Cloud
   */
  public MillionSend(String apiKey, String baseUrl) {
    this(apiKey, baseUrl, false);
  }

  /**
   * @param allowInsecureHttp accept a plain {@code http://} base URL on a non-loopback host;
   *     off by default because the API key travels as a bearer header
   */
  public MillionSend(String apiKey, String baseUrl, boolean allowInsecureHttp) {
    String key = apiKey != null ? apiKey : System.getenv("MILLIONSEND_API_KEY");
    if (key == null || key.isEmpty()) {
      throw new IllegalArgumentException(
          "Missing API key. Pass it to new MillionSend(apiKey) or set MILLIONSEND_API_KEY.");
    }
    String url = resolveBaseUrl(baseUrl, System.getenv("MILLIONSEND_BASE_URL"));
    HttpClient http = new HttpClient(key, url, allowInsecureHttp);
    this.emails = new Emails(http);
    this.batch = new Batch(http);
    this.contacts = new Contacts(http);
    this.topics = new Topics(http);
    this.broadcasts = new Broadcasts(http);
    this.segments = new Segments(http);
    this.deliverability = new Deliverability(http);
    this.suppressions = new Suppressions(http);
    this.domains = new Domains(http);
    this.webhooks = new Webhooks(http);
    this.apiKeys = new ApiKeys(http);
    this.templates = new Templates(http);
    this.contactProperties = new ContactProperties(http);
    this.usage = new Usage(http);
  }

  /** Explicit option, then the environment, then MillionSend Cloud. */
  static String resolveBaseUrl(String explicit, String fromEnv) {
    if (explicit != null && !explicit.isEmpty()) {
      return explicit;
    }
    if (fromEnv != null && !fromEnv.isEmpty()) {
      return fromEnv;
    }
    return DEFAULT_BASE_URL;
  }

  public Emails emails() {
    return emails;
  }

  public Batch batch() {
    return batch;
  }

  public Contacts contacts() {
    return contacts;
  }

  public Topics topics() {
    return topics;
  }

  public Broadcasts broadcasts() {
    return broadcasts;
  }

  public Segments segments() {
    return segments;
  }

  public Deliverability deliverability() {
    return deliverability;
  }

  public Suppressions suppressions() {
    return suppressions;
  }

  public Domains domains() {
    return domains;
  }

  public Webhooks webhooks() {
    return webhooks;
  }

  public ApiKeys apiKeys() {
    return apiKeys;
  }

  public Templates templates() {
    return templates;
  }

  public ContactProperties contactProperties() {
    return contactProperties;
  }

  /** MillionSend extension: plan, limits and today's send count. */
  public Usage usage() {
    return usage;
  }
}

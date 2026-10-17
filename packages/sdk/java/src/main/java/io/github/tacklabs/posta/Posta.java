package io.github.tacklabs.posta;

import io.github.tacklabs.posta.core.HttpClient;
import io.github.tacklabs.posta.services.ApiKeys;
import io.github.tacklabs.posta.services.Batch;
import io.github.tacklabs.posta.services.Broadcasts;
import io.github.tacklabs.posta.services.ContactProperties;
import io.github.tacklabs.posta.services.Contacts;
import io.github.tacklabs.posta.services.Deliverability;
import io.github.tacklabs.posta.services.Domains;
import io.github.tacklabs.posta.services.Emails;
import io.github.tacklabs.posta.services.Segments;
import io.github.tacklabs.posta.services.Suppressions;
import io.github.tacklabs.posta.services.Templates;
import io.github.tacklabs.posta.services.Topics;
import io.github.tacklabs.posta.services.Usage;
import io.github.tacklabs.posta.services.Webhooks;

/**
 * The Posta client. Construct once and reuse.
 *
 * <pre>{@code
 * Posta ms = new Posta("po_123");                         // Posta Cloud
 * Posta self = new Posta("po_123", "https://mail.acme.dev"); // self-hosted
 * CreateEmailResponse sent = ms.emails().send(
 *     CreateEmailOptions.builder()
 *         .from("Acme <onboarding@acme.dev>")
 *         .to("success@simulator.amazonses.com")
 *         .subject("Hello")
 *         .html("<strong>it works</strong>")
 *         .build());
 * }</pre>
 *
 * <p>Every call throws a {@link PostaException} on a non-2xx response (or
 * a transport failure). The API key falls back to {@code POSTA_API_KEY}
 * and the base URL to {@code POSTA_BASE_URL}, then Posta Cloud
 * ({@code https://api.posta.example}). A missing API key throws
 * {@link IllegalArgumentException} at construction.
 */
public final class Posta {

  private static final String DEFAULT_BASE_URL = "https://api.posta.example";

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

  /** Reads the API key from {@code POSTA_API_KEY} and the base URL from the environment. */
  public Posta() {
    this(null, null);
  }

  /** Uses the given API key; base URL from {@code POSTA_BASE_URL} or Posta Cloud. */
  public Posta(String apiKey) {
    this(apiKey, null);
  }

  /**
   * @param apiKey the API key, or {@code null} to read {@code POSTA_API_KEY}
   * @param baseUrl your self-hosted instance URL, or {@code null} to read
   *     {@code POSTA_BASE_URL} then fall back to Posta Cloud
   */
  public Posta(String apiKey, String baseUrl) {
    this(apiKey, baseUrl, false);
  }

  /**
   * @param allowInsecureHttp accept a plain {@code http://} base URL on a non-loopback host;
   *     off by default because the API key travels as a bearer header
   */
  public Posta(String apiKey, String baseUrl, boolean allowInsecureHttp) {
    String key = apiKey != null ? apiKey : System.getenv("POSTA_API_KEY");
    if (key == null || key.isEmpty()) {
      throw new IllegalArgumentException(
          "Missing API key. Pass it to new Posta(apiKey) or set POSTA_API_KEY.");
    }
    String url = resolveBaseUrl(baseUrl, System.getenv("POSTA_BASE_URL"));
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

  /** Explicit option, then the environment, then Posta Cloud. */
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

  /** Posta extension: plan, limits and today's send count. */
  public Usage usage() {
    return usage;
  }
}

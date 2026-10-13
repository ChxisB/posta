package com.millionsend.core;

import com.fasterxml.jackson.annotation.JsonAutoDetect.Visibility;
import com.fasterxml.jackson.annotation.PropertyAccessor;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.millionsend.MillionSendException;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;

/**
 * The transport layer: builds requests, applies auth and per-request headers, maps
 * camelCase SDK types to the snake_case wire (via Jackson), and turns any
 * non-2xx into a {@link MillionSendException}. One instance is shared by every
 * service. Uses the JDK's {@link java.net.http.HttpClient} — no extra HTTP
 * dependency.
 */
public final class HttpClient {

  /** Kept in sync with the Maven {@code version}; surfaced in the User-Agent. */
  public static final String VERSION = "0.8.0";
  private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(10);
  private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(30);

  private final String apiKey;
  private final String baseUrl;
  private final String userAgent;
  private final java.net.http.HttpClient http;
  private final ObjectMapper mapper;

  public HttpClient(String apiKey, String baseUrl) {
    this(apiKey, baseUrl, false);
  }

  public HttpClient(String apiKey, String baseUrl, boolean allowInsecureHttp) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replaceAll("/+$", "");
    // The API key travels as a bearer header, so plain http is loopback-only by default.
    if (!allowInsecureHttp && isInsecureHttpUrl(this.baseUrl)) {
      throw new IllegalArgumentException(
          "Refusing to send the API key over plain http to "
              + this.baseUrl
              + ". Use https, or construct with allowInsecureHttp = true.");
    }
    this.userAgent = "millionsend-java/" + VERSION;
    this.http =
        java.net.http.HttpClient.newBuilder().connectTimeout(CONNECT_TIMEOUT).build();
    // Default serialization inclusion stays ALWAYS so an explicit null in a
    // PATCH body (a contact field being cleared) reaches the wire; request
    // option classes carry @JsonInclude(NON_NULL) to drop their unset fields.
    this.mapper =
        new ObjectMapper()
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
            .setVisibility(PropertyAccessor.FIELD, Visibility.ANY)
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
  }

  /** True for an http:// URL whose host is not loopback. Unparseable URLs are left to the transport. */
  static boolean isInsecureHttpUrl(String url) {
    URI uri;
    try {
      uri = URI.create(url);
    } catch (IllegalArgumentException e) {
      return false;
    }
    if (!"http".equalsIgnoreCase(uri.getScheme())) {
      return false;
    }
    String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
    return !host.equals("localhost") && !host.equals("[::1]") && !host.startsWith("127.");
  }

  /** Percent-encode one path segment (id or email). */
  public static String enc(String segment) {
    return URLEncoder.encode(segment == null ? "" : segment, StandardCharsets.UTF_8).replace("+", "%20");
  }

  public <T> T request(
      String method,
      String path,
      Object body,
      Map<String, String> query,
      RequestOptions options,
      TypeReference<T> returnType)
      throws MillionSendException {

    HttpRequest.Builder rb =
        HttpRequest.newBuilder(URI.create(baseUrl + path + queryString(query)))
            .timeout(REQUEST_TIMEOUT)
            .header("Authorization", "Bearer " + apiKey)
            .header("Accept", "application/json")
            .header("User-Agent", userAgent);

    boolean hasBody = body != null && !"GET".equals(method) && !"DELETE".equals(method);
    if (hasBody) {
      rb.header("Content-Type", "application/json");
      rb.method(method, HttpRequest.BodyPublishers.ofString(serialize(body)));
    } else {
      rb.method(method, HttpRequest.BodyPublishers.noBody());
    }
    if (options != null) {
      // Idempotency is POST-only on the wire.
      if (options.getIdempotencyKey() != null && "POST".equals(method)) {
        rb.header("Idempotency-Key", options.getIdempotencyKey());
      }
      if (options.getBatchValidation() != null) {
        rb.header("x-batch-validation", options.getBatchValidation().getValue());
      }
      for (Map.Entry<String, String> h : options.getAdditionalHeaders().entrySet()) {
        rb.header(h.getKey(), h.getValue());
      }
    }

    HttpResponse<String> response;
    try {
      response = http.send(rb.build(), HttpResponse.BodyHandlers.ofString());
    } catch (IOException e) {
      throw new MillionSendException("application_error", e.getMessage(), null);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new MillionSendException("application_error", e.getMessage(), null);
    }

    int status = response.statusCode();
    String text = response.body();
    if (status < 200 || status >= 300) {
      throw toException(text, status);
    }
    try {
      return mapper.readValue(text, returnType);
    } catch (IOException e) {
      throw new MillionSendException("application_error", e.getMessage(), null);
    }
  }

  private String serialize(Object body) throws MillionSendException {
    try {
      return mapper.writeValueAsString(body);
    } catch (JsonProcessingException e) {
      throw new MillionSendException("application_error", e.getMessage(), null);
    }
  }

  /** Coerce an error body into the canonical shape; fall back to a generic error. */
  private MillionSendException toException(String text, int status) {
    if (text != null && !text.isEmpty()) {
      try {
        JsonNode n = mapper.readTree(text);
        if (n != null && n.isObject()) {
          String name = n.hasNonNull("name") ? n.get("name").asText() : "application_error";
          String message =
              n.hasNonNull("message")
                  ? n.get("message").asText()
                  : "Request failed with status " + status;
          Integer code =
              n.hasNonNull("statusCode") && n.get("statusCode").isNumber()
                  ? n.get("statusCode").asInt()
                  : status;
          return new MillionSendException(name, message, code);
        }
      } catch (IOException ignored) {
        // Not JSON — fall through to the generic error.
      }
    }
    return new MillionSendException(
        "application_error", "Request failed with status " + status, status);
  }

  private static String queryString(Map<String, String> query) {
    if (query == null || query.isEmpty()) {
      return "";
    }
    StringBuilder sb = new StringBuilder("?");
    for (Map.Entry<String, String> e : query.entrySet()) {
      if (e.getValue() == null) {
        continue;
      }
      if (sb.length() > 1) {
        sb.append('&');
      }
      sb.append(URLEncoder.encode(e.getKey(), StandardCharsets.UTF_8))
          .append('=')
          .append(URLEncoder.encode(e.getValue(), StandardCharsets.UTF_8));
    }
    return sb.length() == 1 ? "" : sb.toString();
  }
}

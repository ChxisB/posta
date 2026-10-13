package com.millionsend;

/**
 * The single checked exception every MillionSend call throws on a non-2xx
 * response (or a transport failure). Mirrors the API's error body
 * {@code { statusCode, name, message }}: {@link #getName()} is the stable
 * snake_case discriminant (e.g. {@code validation_error}, {@code not_found}),
 * and {@link #getStatusCode()} is {@code null} when the request never reached
 * the API (a client-side or transport failure).
 */
public class MillionSendException extends Exception {

  // The default the JVM computed before this was declared, so the serialized form is unchanged.
  private static final long serialVersionUID = -5469809787528467192L;

  private final String name;
  private final Integer statusCode;

  public MillionSendException(String name, String message, Integer statusCode) {
    super(message);
    this.name = name;
    this.statusCode = statusCode;
  }

  /** Stable snake_case error code you can switch on. */
  public String getName() {
    return name;
  }

  /** HTTP status; {@code null} when the request never reached the API. */
  public Integer getStatusCode() {
    return statusCode;
  }
}

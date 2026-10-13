package com.millionsend;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.millionsend.model.CreateEmailOptions;
import com.millionsend.model.CreateEmailResponse;
import org.junit.jupiter.api.Test;

/** Transport-level wiring: headers, casing, idempotency, error parsing. */
class ClientTest {

  private static final ObjectMapper JSON = new ObjectMapper();

  private static CreateEmailOptions email() {
    return CreateEmailOptions.builder()
        .from("a@x.dev")
        .to("b@x.dev")
        .subject("s")
        .text("t")
        .build();
  }

  @Test
  void missingApiKeyThrows() {
    assertThrows(IllegalArgumentException.class, () -> new MillionSend(""));
  }

  @Test
  void baseUrlDefaultsToCloudUnlessEnvOrOptionWins() {
    assertEquals("https://api.millionsend.com", MillionSend.resolveBaseUrl(null, null));
    assertEquals("https://api.millionsend.com", MillionSend.resolveBaseUrl(null, ""));
    assertEquals("https://mail.acme.dev", MillionSend.resolveBaseUrl(null, "https://mail.acme.dev"));
    assertEquals(
        "https://self.acme.dev", MillionSend.resolveBaseUrl("https://self.acme.dev", "https://mail.acme.dev"));
  }

  @Test
  void refusesNonLoopbackHttpUnlessAllowed() {
    IllegalArgumentException e =
        assertThrows(
            IllegalArgumentException.class,
            () -> new MillionSend("ms_test", "http://mail.example.com"));
    assertTrue(e.getMessage().contains("allowInsecureHttp"));
    new MillionSend("ms_test", "http://mail.example.com", true);
    new MillionSend("ms_test", "http://localhost:3001");
    new MillionSend("ms_test", "http://127.0.0.1:3001");
  }

  @Test
  void setsAuthAcceptUserAgentAndContentType() throws Exception {
    try (MockServer server = new MockServer()) {
      server.client().emails().send(email());
      assertEquals("Bearer ms_test", server.header("Authorization"));
      assertEquals("application/json", server.header("Accept"));
      assertEquals("application/json", server.header("Content-Type"));
      assertTrue(server.header("User-Agent").startsWith("millionsend-java/"));
    }
  }

  @Test
  void mapsCamelCaseToSnakeCaseAndOmitsUnset() throws Exception {
    try (MockServer server = new MockServer()) {
      server
          .client()
          .emails()
          .send(
              CreateEmailOptions.builder()
                  .from("a@x.dev")
                  .to("b@x.dev")
                  .subject("s")
                  .html("<p>h</p>")
                  .replyTo("r@x.dev")
                  .scheduledAt("2999-01-01T00:00:00Z")
                  .build());
      JsonNode body = JSON.readTree(server.body);
      assertTrue(body.get("to").isArray());
      assertEquals("r@x.dev", body.get("reply_to").get(0).asText());
      assertEquals("2999-01-01T00:00:00Z", body.get("scheduled_at").asText());
      assertFalse(body.has("text"));
      assertFalse(body.has("cc"));
      assertFalse(body.has("replyTo"));
    }
  }

  @Test
  void sendsIdempotencyKeyOnPostWhenProvided() throws Exception {
    try (MockServer server = new MockServer()) {
      server.client().emails().send(email(), "key-123");
      assertEquals("key-123", server.header("Idempotency-Key"));
    }
  }

  @Test
  void omitsIdempotencyKeyWhenNotProvided() throws Exception {
    try (MockServer server = new MockServer()) {
      server.client().emails().send(email());
      assertNull(server.header("Idempotency-Key"));
    }
  }

  @Test
  void returnsParsedDataOn2xx() throws Exception {
    try (MockServer server = new MockServer()) {
      server.responseBody = "{\"id\":\"abc\"}";
      CreateEmailResponse res = server.client().emails().send(email());
      assertEquals("abc", res.getId());
    }
  }

  @Test
  void parsesCanonicalErrorOnNon2xx() throws Exception {
    try (MockServer server = new MockServer()) {
      server.status = 422;
      server.responseBody = "{\"statusCode\":422,\"name\":\"validation_error\",\"message\":\"bad\"}";
      MillionSendException e =
          assertThrows(MillionSendException.class, () -> server.client().emails().send(email()));
      assertEquals(422, e.getStatusCode());
      assertEquals("validation_error", e.getName());
      assertEquals("bad", e.getMessage());
    }
  }

  @Test
  void surfacesAllRecipientsSuppressedOn422() throws Exception {
    try (MockServer server = new MockServer()) {
      server.status = 422;
      server.responseBody =
          "{\"statusCode\":422,\"name\":\"all_recipients_suppressed\","
              + "\"message\":\"All recipients are suppressed\"}";
      MillionSendException e =
          assertThrows(MillionSendException.class, () -> server.client().emails().send(email()));
      assertEquals(422, e.getStatusCode());
      assertEquals("all_recipients_suppressed", e.getName());
      assertEquals("All recipients are suppressed", e.getMessage());
    }
  }

  @Test
  void fallsBackToGenericErrorWhenBodyIsNotCanonical() throws Exception {
    try (MockServer server = new MockServer()) {
      server.status = 500;
      server.responseBody = "gateway boom";
      MillionSendException e =
          assertThrows(MillionSendException.class, () -> server.client().emails().get("e1"));
      assertEquals(500, e.getStatusCode());
      assertEquals("application_error", e.getName());
      assertEquals("Request failed with status 500", e.getMessage());
    }
  }

  @Test
  void transportFailureHasNullStatusCode() throws Exception {
    String closedBaseUrl;
    try (MockServer server = new MockServer()) {
      closedBaseUrl = server.baseUrl();
    } // server stopped: the port now refuses connections
    MillionSend ms = new MillionSend("ms_test", closedBaseUrl);
    MillionSendException e =
        assertThrows(MillionSendException.class, () -> ms.emails().send(email()));
    assertNull(e.getStatusCode());
    assertEquals("application_error", e.getName());
  }

  @Test
  void stripsTrailingSlashFromBaseUrl() throws Exception {
    try (MockServer server = new MockServer()) {
      new MillionSend("ms_test", server.baseUrl() + "/").emails().get("e1");
      assertEquals("/emails/e1", server.path);
    }
  }
}

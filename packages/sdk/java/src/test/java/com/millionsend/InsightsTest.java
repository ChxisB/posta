package com.millionsend;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.millionsend.model.DeliverabilityReport;
import com.millionsend.model.Email;
import com.millionsend.model.EmailInsights;
import com.millionsend.model.InsightCheck;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Deserialization of the insights + deliverability wire shapes. */
class InsightsTest {

  static final String INSIGHTS_JSON =
      "{\"object\":\"email_insights\","
          + "\"email_id\":\"49a3999c-0ce1-4ea6-ab68-afcd6dc2e794\","
          + "\"score\":8.5,\"score_version\":1,\"band\":\"excellent\","
          + "\"marketing\":true,\"html_size_bytes\":12345,"
          + "\"computed_at\":\"2026-08-31T12:00:00.000Z\","
          + "\"checks\":["
          + "{\"id\":\"list_unsubscribe\",\"severity\":\"critical\",\"status\":\"fail\","
          + "\"penalty\":1.25,\"detail\":{\"header\":null,\"expected\":\"one-click\"}},"
          + "{\"id\":\"plain_text_part\",\"severity\":\"minor\",\"status\":\"pass\",\"penalty\":0}"
          + "]}";

  static final String DELIVERABILITY_JSON =
      "{\"object\":\"deliverability\",\"score\":8.7,\"band\":\"good\","
          + "\"content_score\":8.2,\"outcome_score\":9.1,"
          + "\"complaint_rate\":0.0002,\"hard_bounce_rate\":0.001,"
          + "\"emails_sent\":12345,\"scored_recipients\":23456,"
          + "\"window_days\":30,\"insufficient_outcome_data\":false,"
          + "\"guardrail_status\":\"ok\",\"score_version\":1}";

  private static final String EMAIL_JSON_PREFIX =
      "{\"object\":\"email\",\"id\":\"e1\",\"from\":\"a@x.dev\",\"to\":[\"b@x.dev\"],"
          + "\"cc\":null,\"bcc\":null,\"reply_to\":null,\"subject\":\"s\","
          + "\"html\":\"<p>h</p>\",\"text\":null,"
          + "\"created_at\":\"2026-08-31T12:00:00.000Z\",\"scheduled_at\":null,"
          + "\"message_id\":\"<m@x.dev>\",\"last_event\":\"delivered\",\"score\":";

  private MockServer server;
  private MillionSend ms;

  @BeforeEach
  void setUp() throws Exception {
    server = new MockServer();
    ms = server.client();
  }

  @AfterEach
  void tearDown() {
    server.close();
  }

  @Test
  void emailCarriesScoreWhenPresent() throws Exception {
    server.responseBody = EMAIL_JSON_PREFIX + "8.5}";
    Email email = ms.emails().get("e1");
    assertEquals(8.5, email.getScore());
    assertEquals("delivered", email.getLastEvent());
  }

  @Test
  void emailScoreIsNullWhenNoInsights() throws Exception {
    server.responseBody = EMAIL_JSON_PREFIX + "null}";
    assertNull(ms.emails().get("e1").getScore());
  }

  @Test
  void insightsHappyPath() throws Exception {
    server.responseBody = INSIGHTS_JSON;
    EmailInsights insights = ms.emails().getInsights("e1");
    assertEquals("email_insights", insights.getObject());
    assertEquals("49a3999c-0ce1-4ea6-ab68-afcd6dc2e794", insights.getEmailId());
    assertEquals(8.5, insights.getScore());
    assertEquals(1, insights.getScoreVersion());
    assertEquals("excellent", insights.getBand());
    assertTrue(insights.isMarketing());
    assertEquals(12345, insights.getHtmlSizeBytes());
    assertEquals("2026-08-31T12:00:00.000Z", insights.getComputedAt());
    assertEquals(2, insights.getChecks().size());

    InsightCheck failed = insights.getChecks().get(0);
    assertEquals("list_unsubscribe", failed.getId());
    assertEquals("critical", failed.getSeverity());
    assertEquals("fail", failed.getStatus());
    assertEquals(1.25, failed.getPenalty());
    assertEquals("one-click", failed.getDetail().get("expected"));
    assertNull(failed.getDetail().get("header"));

    InsightCheck passed = insights.getChecks().get(1);
    assertEquals("pass", passed.getStatus());
    assertEquals(0.0, passed.getPenalty());
    assertNull(passed.getDetail());
  }

  @Test
  void insightsNotFoundThrows() throws Exception {
    server.status = 404;
    server.responseBody =
        "{\"statusCode\":404,\"name\":\"not_found\",\"message\":\"Email not found\"}";
    MillionSendException e =
        assertThrows(MillionSendException.class, () -> ms.emails().getInsights("missing"));
    assertEquals(404, e.getStatusCode());
    assertEquals("not_found", e.getName());
  }

  @Test
  void deliverabilityHappyPath() throws Exception {
    server.responseBody = DELIVERABILITY_JSON;
    DeliverabilityReport report = ms.deliverability().get();
    assertEquals("deliverability", report.getObject());
    assertEquals(8.7, report.getScore());
    assertEquals("good", report.getBand());
    assertEquals(8.2, report.getContentScore());
    assertEquals(9.1, report.getOutcomeScore());
    assertEquals(0.0002, report.getComplaintRate());
    assertEquals(0.001, report.getHardBounceRate());
    assertEquals(12345, report.getEmailsSent());
    assertEquals(23456, report.getScoredRecipients());
    assertEquals(30, report.getWindowDays());
    assertFalse(report.isInsufficientOutcomeData());
    assertEquals("ok", report.getGuardrailStatus());
    assertEquals(1, report.getScoreVersion());
  }

  @Test
  void deliverabilityNullScoresStayNull() throws Exception {
    server.responseBody =
        "{\"object\":\"deliverability\",\"score\":null,\"band\":null,"
            + "\"content_score\":null,\"outcome_score\":null,"
            + "\"complaint_rate\":0,\"hard_bounce_rate\":0,"
            + "\"emails_sent\":0,\"scored_recipients\":0,"
            + "\"window_days\":30,\"insufficient_outcome_data\":true,"
            + "\"guardrail_status\":\"ok\",\"score_version\":1}";
    DeliverabilityReport report = ms.deliverability().get();
    assertNull(report.getScore());
    assertNull(report.getBand());
    assertNull(report.getContentScore());
    assertNull(report.getOutcomeScore());
    assertTrue(report.isInsufficientOutcomeData());
  }

  @Test
  void unknownFutureValuesAndFieldsDoNotBreakDeserialization() throws Exception {
    // band/severity/status/guardrail_status are open on the wire: a future
    // value (or a brand-new field) must deserialize, never throw.
    server.responseBody =
        "{\"object\":\"email_insights\",\"email_id\":\"e1\",\"score\":5,"
            + "\"score_version\":2,\"band\":\"stellar\",\"marketing\":false,"
            + "\"html_size_bytes\":null,\"computed_at\":\"2027-01-01T00:00:00.000Z\","
            + "\"new_top_level_field\":{\"nested\":true},"
            + "\"checks\":[{\"id\":\"brand_new_check\",\"severity\":\"catastrophic\","
            + "\"status\":\"deferred\",\"penalty\":0,\"extra\":\"ignored\"}]}";
    EmailInsights insights = ms.emails().getInsights("e1");
    assertEquals("stellar", insights.getBand());
    assertNull(insights.getHtmlSizeBytes());
    assertEquals("catastrophic", insights.getChecks().get(0).getSeverity());
    assertEquals("deferred", insights.getChecks().get(0).getStatus());

    server.responseBody =
        "{\"object\":\"deliverability\",\"score\":1.1,\"band\":\"abysmal\","
            + "\"content_score\":1,\"outcome_score\":1,"
            + "\"complaint_rate\":0.2,\"hard_bounce_rate\":0.2,"
            + "\"emails_sent\":1,\"scored_recipients\":1,\"window_days\":30,"
            + "\"insufficient_outcome_data\":false,"
            + "\"guardrail_status\":\"quarantined\",\"score_version\":9}";
    DeliverabilityReport report = ms.deliverability().get();
    assertEquals("abysmal", report.getBand());
    assertEquals("quarantined", report.getGuardrailStatus());
  }
}

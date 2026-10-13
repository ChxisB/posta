package com.millionsend;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.millionsend.model.ContactAddress;
import com.millionsend.model.ContactTopic;
import com.millionsend.model.CreateBroadcastOptions;
import com.millionsend.model.CreateContactOptions;
import com.millionsend.model.CreateEmailOptions;
import com.millionsend.model.CreateSegmentOptions;
import com.millionsend.model.CreateTopicOptions;
import com.millionsend.model.ListOptions;
import com.millionsend.model.ListResponse;
import com.millionsend.model.SegmentCondition;
import com.millionsend.model.SegmentFilter;
import com.millionsend.model.SendBroadcastOptions;
import com.millionsend.model.Subscription;
import com.millionsend.model.UpdateBroadcastOptions;
import com.millionsend.model.UpdateContactOptions;
import com.millionsend.model.UpdateContactTopicsOptions;
import com.millionsend.model.UpdateSegmentOptions;
import java.util.Arrays;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Method + path + body mapping for a representative endpoint of every resource. */
class ResourcesTest {

  private static final ObjectMapper JSON = new ObjectMapper();

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

  private JsonNode body() throws Exception {
    return JSON.readTree(server.body);
  }

  private static CreateEmailOptions email(String to, String subject) {
    return CreateEmailOptions.builder()
        .from("a@x.dev")
        .to(to)
        .subject(subject)
        .text("body")
        .build();
  }

  @Test
  void emails() throws Exception {
    ms.emails().get("e1");
    assertEquals("GET", server.method);
    assertEquals("/emails/e1", server.path);

    ms.emails().cancel("e1");
    assertEquals("POST", server.method);
    assertEquals("/emails/e1/cancel", server.path);

    server.responseBody = InsightsTest.INSIGHTS_JSON;
    ms.emails().getInsights("e1");
    assertEquals("GET", server.method);
    assertEquals("/emails/e1/insights", server.path);
  }

  @Test
  void deliverability() throws Exception {
    server.responseBody = InsightsTest.DELIVERABILITY_JSON;
    ms.deliverability().get();
    assertEquals("GET", server.method);
    assertEquals("/deliverability", server.path);
  }

  @Test
  void batch() throws Exception {
    server.responseBody = "{\"data\":[{\"id\":\"1\"},{\"id\":\"2\"}]}";
    ms.batch().send(Arrays.asList(email("b@x.dev", "1"), email("c@x.dev", "2")), "batch-1");
    assertEquals("POST", server.method);
    assertEquals("/emails/batch", server.path);
    assertTrue(body().isArray());
    assertEquals(2, body().size());
    assertEquals("batch-1", server.header("Idempotency-Key"));
  }

  @Test
  void contactsCreate() throws Exception {
    ms.contacts()
        .create(CreateContactOptions.builder().email("c@x.dev").firstName("Ada").build());
    assertEquals("POST", server.method);
    assertEquals("/contacts", server.path);
    assertEquals("c@x.dev", body().get("email").asText());
    assertEquals("Ada", body().get("first_name").asText());
  }

  @Test
  void contactsAddressing() throws Exception {
    ms.contacts().get("c1");
    assertEquals("/contacts/c1", server.path);

    ms.contacts().get(ContactAddress.email("c@x.dev"));
    // The raw (undecoded) path proves the client percent-encoded the segment.
    assertEquals("/contacts/c%40x.dev", server.rawPath);
    assertEquals("/contacts/c@x.dev", server.path);
  }

  @Test
  void contactsUpdateSendsOnlySetKeysAndNullClears() throws Exception {
    ms.contacts()
        .update(UpdateContactOptions.builder().id("c1").firstName(null).unsubscribed(true).build());
    assertEquals("PATCH", server.method);
    assertEquals("/contacts/c1", server.path);
    assertTrue(body().get("first_name").isNull());
    assertTrue(body().get("unsubscribed").asBoolean());
    assertFalse(body().has("last_name"));
  }

  @Test
  void contactsRemoveAndList() throws Exception {
    ms.contacts().remove(ContactAddress.email("c@x.dev"));
    assertEquals("DELETE", server.method);

    ms.contacts().list(ListOptions.builder().after("cur").build());
    assertEquals("/contacts", server.path);
    assertEquals("after=cur", server.query);
  }

  @Test
  void contactTopicsUpdate() throws Exception {
    ms.contacts()
        .topics()
        .update(
            UpdateContactTopicsOptions.builder().id("c1").topic("t1", Subscription.OPT_OUT).build());
    assertEquals("PATCH", server.method);
    assertEquals("/contacts/c1/topics", server.path);
    assertTrue(body().isArray());
    assertEquals("t1", body().get(0).get("id").asText());
    assertEquals("opt_out", body().get(0).get("subscription").asText());
  }

  @Test
  void contactTopicsList() throws Exception {
    server.responseBody =
        "{\"object\":\"list\",\"has_more\":false,\"data\":[{\"id\":\"t1\",\"name\":\"Insights\","
            + "\"description\":null,\"subscription\":\"opt_in\",\"explicit\":false,"
            + "\"visibility\":\"public\"}]}";
    ListResponse<ContactTopic> res = ms.contacts().topics().list("ada+1@x.dev");
    assertEquals("GET", server.method);
    assertEquals("/contacts/ada%2B1%40x.dev/topics", server.rawPath);
    assertEquals("", server.body);
    assertEquals("list", res.getObject());
    assertFalse(res.isHasMore());
    ContactTopic t = res.getData().get(0);
    assertEquals("t1", t.getId());
    assertEquals("Insights", t.getName());
    assertNull(t.getDescription());
    assertEquals(Subscription.OPT_IN, t.getSubscription());
    assertFalse(t.isExplicit());
    assertEquals("public", t.getVisibility());
  }

  @Test
  void broadcasts() throws Exception {
    ms.broadcasts()
        .create(
            CreateBroadcastOptions.builder()
                .segmentId("s1")
                .from("a@x.dev")
                .subject("News")
                .html("<p>hi</p>")
                .build());
    assertEquals("/broadcasts", server.path);
    assertEquals("s1", body().get("segment_id").asText());
    assertEquals("News", body().get("subject").asText());
    assertFalse(body().has("audience_id"));

    ms.broadcasts().get("b1");
    assertEquals("/broadcasts/b1", server.path);

    ms.broadcasts().list();
    assertEquals("/broadcasts", server.path);

    ms.broadcasts().update("b1", UpdateBroadcastOptions.builder().subject("New").build());
    assertEquals("PATCH", server.method);
    assertEquals("/broadcasts/b1", server.path);

    ms.broadcasts().send("b1", SendBroadcastOptions.builder().scheduledAt("2999-01-01T00:00:00Z").build());
    assertEquals("/broadcasts/b1/send", server.path);
    assertEquals("2999-01-01T00:00:00Z", body().get("scheduled_at").asText());

    ms.broadcasts().cancel("b1");
    assertEquals("/broadcasts/b1/cancel", server.path);

    ms.broadcasts().remove("b1");
    assertEquals("DELETE", server.method);
  }

  @Test
  void topics() throws Exception {
    ms.topics().create(CreateTopicOptions.builder().name("Product").defaultSubscription(Subscription.OPT_IN).build());
    assertEquals("/topics", server.path);
    assertEquals("Product", body().get("name").asText());
    assertEquals("opt_in", body().get("default_subscription").asText());

    ms.topics().get("t1");
    assertEquals("/topics/t1", server.path);

    ms.topics().list();
    assertEquals("GET", server.method);
    assertEquals("/topics", server.path);

    ms.topics().remove("t1");
    assertEquals("DELETE", server.method);
  }

  @Test
  void segments() throws Exception {
    SegmentFilter filter =
        SegmentFilter.builder().match("all").condition(new SegmentCondition("email", "is_set")).build();
    ms.segments().create(CreateSegmentOptions.builder().name("Active").filter(filter).build());
    assertEquals("/segments", server.path);
    assertEquals("all", body().get("filter").get("match").asText());
    assertFalse(body().has("audience_id"));

    ms.segments().get("s1");
    assertEquals("/segments/s1", server.path);

    ms.segments().list(ListOptions.builder().before("cur").build());
    assertEquals("/segments", server.path);
    assertEquals("before=cur", server.query);

    ms.segments().update("s1", UpdateSegmentOptions.builder().name("Renamed").build());
    assertEquals("PATCH", server.method);
    assertEquals("/segments/s1", server.path);

    ms.segments().remove("s1");
    assertEquals("DELETE", server.method);
  }
}

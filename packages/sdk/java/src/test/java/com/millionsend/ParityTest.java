package com.millionsend;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.millionsend.core.RequestOptions;
import com.millionsend.model.AddSuppressionOptions;
import com.millionsend.model.AddSuppressionsOptions;
import com.millionsend.model.Attachment;
import com.millionsend.model.BatchGetContactsResponse;
import com.millionsend.model.BatchValidation;
import com.millionsend.model.ConflictMode;
import com.millionsend.model.Contact;
import com.millionsend.model.ContactAddress;
import com.millionsend.model.ContactInclude;
import com.millionsend.model.ContactProperty;
import com.millionsend.model.DataResponse;
import com.millionsend.model.CreateApiKeyOptions;
import com.millionsend.model.CreateApiKeyResponse;
import com.millionsend.model.CreateBatchContactsResponse;
import com.millionsend.model.CreateBatchEmailsResponse;
import com.millionsend.model.CreateBroadcastOptions;
import com.millionsend.model.CreateContactOptions;
import com.millionsend.model.CreateContactPropertyOptions;
import com.millionsend.model.CreateDomainOptions;
import com.millionsend.model.CreateEmailOptions;
import com.millionsend.model.CreateTemplateOptions;
import com.millionsend.model.CreateTopicOptions;
import com.millionsend.model.CreateWebhookOptions;
import com.millionsend.model.CreateWebhookResponse;
import com.millionsend.model.Domain;
import com.millionsend.model.ListContactsOptions;
import com.millionsend.model.ListOptions;
import com.millionsend.model.ListResponse;
import com.millionsend.model.ListSuppressionsOptions;
import com.millionsend.model.PreferencesLink;
import com.millionsend.model.RemoveContactOptions;
import com.millionsend.model.RemoveContactResponse;
import com.millionsend.model.RemoveContactsOptions;
import com.millionsend.model.RemoveSuppressionsOptions;
import com.millionsend.model.RotateWebhookOptions;
import com.millionsend.model.RotateWebhookResponse;
import com.millionsend.model.Subscription;
import com.millionsend.model.Suppression;
import com.millionsend.model.SuppressionOrigin;
import com.millionsend.model.Tag;
import com.millionsend.model.Template;
import com.millionsend.model.UpdateBroadcastOptions;
import com.millionsend.model.UpdateContactPropertyOptions;
import com.millionsend.model.UpdateDomainOptions;
import com.millionsend.model.UpdateEmailOptions;
import com.millionsend.model.UpdateTemplateOptions;
import com.millionsend.model.UpdateTopicOptions;
import com.millionsend.model.UpdateWebhookOptions;
import com.millionsend.model.UsageReport;
import com.millionsend.model.Webhook;
import com.millionsend.model.WebhookEvent;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Wire parity: every request field reaches the body, the batch-validation
 * header and typed errors, explicit-null clears, and method + path + query +
 * body for each resource added alongside the Resend surface.
 */
class ParityTest {

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

  private static JsonNode json(String s) throws Exception {
    return JSON.readTree(s);
  }

  @Test
  void sendPutsEveryFieldOnTheWire() throws Exception {
    Map<String, String> headers = new LinkedHashMap<>();
    headers.put("X-Entity-Ref-ID", "ref-1");
    ms.emails()
        .send(
            CreateEmailOptions.builder()
                .from("Acme <a@x.dev>")
                .to("b@x.dev", "c@x.dev")
                .subject("s")
                .html("<p>h</p>")
                .text("t")
                .cc("cc@x.dev")
                .bcc("bcc@x.dev")
                .replyTo("r@x.dev")
                .scheduledAt("2999-01-01T00:00:00Z")
                .tag(new Tag("k", "v"))
                .addTag(new Tag("k2", "v2"))
                .topicId("11111111-1111-1111-1111-111111111111")
                .attachment(
                    Attachment.builder()
                        .fileName("a.txt")
                        .content("aGk=")
                        .contentType("text/plain")
                        .contentId("cid1")
                        .build())
                .addAttachment(Attachment.builder().fileName("b.pdf").path("https://x.dev/b.pdf").build())
                .headers(headers)
                .header("X-Other", "2")
                .addHeader("X-Third", "3")
                .template(Collections.singletonMap("id", "tpl_1"))
                .build());
    assertEquals("POST", server.method);
    assertEquals("/emails", server.path);
    assertEquals(
        json(
            "{\"from\":\"Acme <a@x.dev>\",\"to\":[\"b@x.dev\",\"c@x.dev\"],\"subject\":\"s\","
                + "\"html\":\"<p>h</p>\",\"text\":\"t\",\"cc\":[\"cc@x.dev\"],\"bcc\":[\"bcc@x.dev\"],"
                + "\"reply_to\":[\"r@x.dev\"],\"scheduled_at\":\"2999-01-01T00:00:00Z\","
                + "\"tags\":[{\"name\":\"k\",\"value\":\"v\"},{\"name\":\"k2\",\"value\":\"v2\"}],"
                + "\"topic_id\":\"11111111-1111-1111-1111-111111111111\","
                + "\"attachments\":[{\"filename\":\"a.txt\",\"content\":\"aGk=\","
                + "\"content_type\":\"text/plain\",\"content_id\":\"cid1\"},"
                + "{\"filename\":\"b.pdf\",\"path\":\"https://x.dev/b.pdf\"}],"
                + "\"headers\":{\"X-Entity-Ref-ID\":\"ref-1\",\"X-Other\":\"2\",\"X-Third\":\"3\"},"
                + "\"template\":{\"id\":\"tpl_1\"}}"),
        body());
  }

  @Test
  void requestOptionsCarryIdempotencyKeyAndExtraHeaders() throws Exception {
    ms.emails()
        .send(
            CreateEmailOptions.builder().from("a@x.dev").to("b@x.dev").subject("s").text("t").build(),
            RequestOptions.builder().setIdempotencyKey("key-1").add("X-Trace", "abc").build());
    assertEquals("key-1", server.header("Idempotency-Key"));
    assertEquals("abc", server.header("X-Trace"));
    assertNull(server.header("x-batch-validation"));
  }

  @Test
  void batchSendsValidationHeaderAndTypesErrors() throws Exception {
    server.responseBody =
        "{\"data\":[{\"id\":\"e1\"}],\"errors\":[{\"index\":1,\"message\":\"emails.1: bad\"}]}";
    CreateBatchEmailsResponse res =
        ms.batch()
            .send(
                Arrays.asList(
                    CreateEmailOptions.builder().from("a@x.dev").to("b@x.dev").subject("1").text("t").build(),
                    CreateEmailOptions.builder().from("a@x.dev").to("bad").subject("2").text("t").build()),
                RequestOptions.builder()
                    .idempotencyKey("batch-1")
                    .batchValidation(BatchValidation.PERMISSIVE)
                    .build());
    assertEquals("POST", server.method);
    assertEquals("/emails/batch", server.path);
    assertEquals("permissive", server.header("x-batch-validation"));
    assertEquals("batch-1", server.header("Idempotency-Key"));
    assertEquals(2, body().size());
    assertEquals("e1", res.getData().get(0).getId());
    assertEquals(1, res.getErrors().get(0).getIndex());
    assertEquals("emails.1: bad", res.getErrors().get(0).getMessage());

    server.responseBody = "{\"data\":[{\"id\":\"e1\"}]}";
    res = ms.batch().send(Collections.singletonList(
        CreateEmailOptions.builder().from("a@x.dev").to("b@x.dev").subject("1").text("t").build()));
    assertNull(server.header("x-batch-validation"));
    assertNull(res.getErrors());
  }

  @Test
  void emailsListUpdateRemove() throws Exception {
    server.responseBody = "{\"object\":\"list\",\"data\":[],\"has_more\":false}";
    ms.emails().list(ListOptions.builder().limit(5).build());
    assertEquals("GET", server.method);
    assertEquals("/emails", server.path);
    assertEquals("limit=5", server.query);

    server.responseBody = "{\"object\":\"email\",\"id\":\"e1\"}";
    ms.emails().update("e1", UpdateEmailOptions.builder().scheduledAt("2999-01-01T00:00:00Z").build());
    assertEquals("PATCH", server.method);
    assertEquals("/emails/e1", server.path);
    assertEquals(json("{\"scheduled_at\":\"2999-01-01T00:00:00Z\"}"), body());

    ms.emails().remove("e1");
    assertEquals("DELETE", server.method);
    assertEquals("/emails/e1", server.path);
  }

  @Test
  void contactCreateCarriesSegmentsAndTopics() throws Exception {
    ms.contacts()
        .create(
            CreateContactOptions.builder()
                .email("c@x.dev")
                .firstName("Ada")
                .lastName("L")
                .unsubscribed(false)
                .properties(Collections.singletonMap("plan", "pro"))
                .segment("s1")
                .topic("t1", Subscription.OPT_OUT)
                .build());
    assertEquals(
        json(
            "{\"email\":\"c@x.dev\",\"first_name\":\"Ada\",\"last_name\":\"L\",\"unsubscribed\":false,"
                + "\"properties\":{\"plan\":\"pro\"},\"segments\":[{\"id\":\"s1\"}],"
                + "\"topics\":[{\"id\":\"t1\",\"subscription\":\"opt_out\"}]}"),
        body());
  }

  @Test
  void contactPropertiesDecodeAsTypedValues() throws Exception {
    server.responseBody =
        "{\"object\":\"contact\",\"id\":\"c1\",\"email\":\"c@x.dev\",\"first_name\":null,"
            + "\"last_name\":null,\"created_at\":\"2026-01-01T00:00:00.000Z\",\"unsubscribed\":false,"
            + "\"properties\":{\"plan\":{\"type\":\"string\",\"value\":\"pro\"},"
            + "\"seats\":{\"type\":\"number\",\"value\":3}}}";
    Contact c = ms.contacts().get("c1");
    assertEquals("string", c.getProperties().get("plan").getType());
    assertEquals("pro", c.getProperties().get("plan").getValue());
    assertEquals("number", c.getProperties().get("seats").getType());
    assertEquals(3, ((Number) c.getProperties().get("seats").getValue()).intValue());
  }

  @Test
  void contactsBatch() throws Exception {
    server.responseBody =
        "{\"data\":[{\"object\":\"contact\",\"index\":0,\"id\":\"c1\",\"status\":\"created\"}],"
            + "\"counts\":{\"created\":1,\"updated\":0,\"skipped\":0,\"failed\":1},"
            + "\"errors\":[{\"index\":1,\"message\":\"invalid email\"}]}";
    CreateBatchContactsResponse res =
        ms.contacts()
            .batch()
            .create(
                Arrays.asList(
                    CreateContactOptions.builder().email("a@x.dev").build(),
                    CreateContactOptions.builder().email("nope").build()),
                ConflictMode.UPSERT,
                RequestOptions.builder().batchValidation(BatchValidation.PERMISSIVE).build());
    assertEquals("POST", server.method);
    assertEquals("/contacts/batch", server.path);
    assertEquals("on_conflict=upsert", server.query);
    assertEquals("permissive", server.header("x-batch-validation"));
    assertEquals(json("[{\"email\":\"a@x.dev\"},{\"email\":\"nope\"}]"), body());
    assertEquals(0, res.getData().get(0).getIndex());
    assertEquals("created", res.getData().get(0).getStatus());
    assertEquals(1, res.getCounts().getCreated());
    assertEquals(1, res.getCounts().getFailed());
    assertEquals("invalid email", res.getErrors().get(0).getMessage());

    ms.contacts().batch().create(Collections.singletonList(CreateContactOptions.builder().email("a@x.dev").build()));
    assertNull(server.query);
    assertNull(server.header("x-batch-validation"));
  }

  @Test
  void contactsBatchRemove() throws Exception {
    server.responseBody =
        "{\"data\":[{\"object\":\"contact\",\"contact\":\"c1\",\"deleted\":true}]}";
    DataResponse<RemoveContactResponse> res =
        ms.contacts().batch().remove(RemoveContactsOptions.builder().id("c1").id("c2").build());
    assertEquals("POST", server.method);
    assertEquals("/contacts/batch/remove", server.path);
    assertEquals(json("{\"ids\":[\"c1\",\"c2\"]}"), body());
    assertEquals(1, res.getData().size());
    assertEquals("c1", res.getData().get(0).getContact());
    assertTrue(res.getData().get(0).getDeleted());

    ms.contacts()
        .batch()
        .remove(RemoveContactsOptions.builder().emails(Arrays.asList("a@x.dev", "b@x.dev")).build());
    assertEquals(json("{\"emails\":[\"a@x.dev\",\"b@x.dev\"]}"), body());
    ms.contacts().batch().remove(RemoveContactsOptions.builder().id("c1").erase(true).build());
    assertEquals(json("{\"ids\":[\"c1\"],\"erase\":true}"), body());
    assertThrows(
        IllegalArgumentException.class,
        () -> RemoveContactsOptions.builder().id("x").email("y").build());
    assertThrows(IllegalArgumentException.class, () -> RemoveContactsOptions.builder().build());
  }

  @Test
  void contactsRemoveErase() throws Exception {
    server.responseBody = "{\"object\":\"contact\",\"contact\":\"c1\",\"deleted\":true}";
    RemoveContactResponse res =
        ms.contacts().remove(RemoveContactOptions.builder().email("a@x.dev").erase(true).build());
    assertEquals("DELETE", server.method);
    assertEquals("/contacts/a@x.dev", server.path);
    assertEquals("erase=true", server.query);
    assertTrue(res.getDeleted());

    ms.contacts().remove(RemoveContactOptions.builder().id("c1").build());
    assertEquals("/contacts/c1", server.path);
    assertNull(server.query);

    ms.contacts().remove(ContactAddress.id("c1"));
    assertNull(server.query);
  }

  @Test
  void contactsBatchGet() throws Exception {
    server.responseBody =
        "{\"object\":\"list\",\"data\":[{\"object\":\"contact\",\"id\":\"c1\",\"email\":\"a@x.dev\","
            + "\"first_name\":null,\"last_name\":null,\"created_at\":\"2026-01-01T00:00:00.000Z\","
            + "\"unsubscribed\":false,\"properties\":{\"seats\":{\"type\":\"number\",\"value\":3}},"
            + "\"topics\":[]}],\"missing\":[{\"index\":1,\"email\":\"nobody@x.dev\"}]}";
    BatchGetContactsResponse res =
        ms.contacts()
            .batch()
            .get(
                Arrays.asList(ContactAddress.id("c1"), ContactAddress.email("nobody@x.dev")),
                ContactInclude.PROPERTIES,
                ContactInclude.TOPICS);
    assertEquals("POST", server.method);
    assertEquals("/contacts/batch/get", server.path);
    assertEquals(
        json(
            "{\"contacts\":[{\"id\":\"c1\"},{\"email\":\"nobody@x.dev\"}],"
                + "\"include\":[\"properties\",\"topics\"]}"),
        body());
    assertEquals("list", res.getObject());
    assertEquals(1, res.getData().size());
    Contact c = res.getData().get(0);
    assertEquals("c1", c.getId());
    assertEquals(3, ((Number) c.getProperties().get("seats").getValue()).intValue());
    assertTrue(c.getTopics().isEmpty());
    assertEquals(1, res.getMissing().get(0).getIndex());
    assertEquals("nobody@x.dev", res.getMissing().get(0).getEmail());
    assertNull(res.getMissing().get(0).getId());

    // No include → no key; an address with both set sends the email only.
    ms.contacts()
        .batch()
        .get(Collections.singletonList(ContactAddress.builder().id("c1").email("a@x.dev").build()));
    assertEquals(json("{\"contacts\":[{\"email\":\"a@x.dev\"}]}"), body());
  }

  @Test
  void contactsListInclude() throws Exception {
    server.responseBody =
        "{\"object\":\"list\",\"has_more\":false,\"data\":[{\"id\":\"c1\",\"email\":\"c@x.dev\","
            + "\"first_name\":null,\"last_name\":null,\"created_at\":\"2026-01-01T00:00:00.000Z\","
            + "\"unsubscribed\":false,\"properties\":{\"plan\":{\"type\":\"string\",\"value\":\"pro\"}},"
            + "\"topics\":[{\"id\":\"t1\",\"name\":\"Insights\",\"description\":null,"
            + "\"subscription\":\"opt_out\",\"explicit\":true,\"visibility\":\"public\"}]}]}";
    ListResponse<Contact> res =
        ms.contacts()
            .list(
                ListContactsOptions.builder()
                    .limit(5)
                    .include(ContactInclude.PROPERTIES, ContactInclude.TOPICS)
                    .build());
    assertEquals("GET", server.method);
    assertEquals("/contacts", server.path);
    assertEquals("limit=5&include=properties%2Ctopics", server.query);
    Contact c = res.getData().get(0);
    assertEquals("pro", c.getProperties().get("plan").getValue());
    assertEquals("t1", c.getTopics().get(0).getId());
    assertEquals(Subscription.OPT_OUT, c.getTopics().get(0).getSubscription());
    assertTrue(c.getTopics().get(0).isExplicit());

    server.responseBody = "{\"object\":\"list\",\"data\":[],\"has_more\":false}";
    res = ms.contacts().list(ListContactsOptions.builder().limit(5).build());
    assertEquals("limit=5", server.query);
    assertTrue(res.getData().isEmpty());
  }

  @Test
  void contactPreferencesLink() throws Exception {
    server.responseBody =
        "{\"object\":\"preferences_link\",\"contact\":\"c1\","
            + "\"url\":\"https://app.x.dev/unsubscribe/tok\"}";
    PreferencesLink link = ms.contacts().preferencesLink("c1");
    assertEquals("POST", server.method);
    assertEquals("/contacts/c1/preferences-link", server.path);
    assertEquals("", server.body);
    assertEquals("preferences_link", link.getObject());
    assertEquals("c1", link.getContact());
    assertEquals("https://app.x.dev/unsubscribe/tok", link.getUrl());

    ms.contacts().preferencesLink(ContactAddress.email("ada+1@x.dev"));
    assertEquals("/contacts/ada%2B1%40x.dev/preferences-link", server.rawPath);
  }

  @Test
  void contactSegmentsAddRemove() throws Exception {
    ms.contacts().segments().add("c@x.dev", "s1");
    assertEquals("POST", server.method);
    assertEquals("/contacts/c%40x.dev/segments/s1", server.rawPath);
    assertEquals("", server.body);

    ms.contacts().segments().remove("c1", "s1");
    assertEquals("DELETE", server.method);
    assertEquals("/contacts/c1/segments/s1", server.path);
  }

  @Test
  void broadcastCreateCarriesPreviewSendScheduleAndUpdateClearsTopicWithNull() throws Exception {
    ms.broadcasts()
        .create(
            CreateBroadcastOptions.builder()
                .name("n")
                .segmentId("s1")
                .from("a@x.dev")
                .subject("News")
                .html("<p>hi</p>")
                .text("hi")
                .replyTo("r@x.dev")
                .previewText("pre")
                .topicId("t1")
                .send(true)
                .scheduledAt("in 1 hour")
                .build());
    assertEquals(
        json(
            "{\"name\":\"n\",\"segment_id\":\"s1\",\"from\":\"a@x.dev\",\"subject\":\"News\","
                + "\"html\":\"<p>hi</p>\",\"text\":\"hi\",\"reply_to\":[\"r@x.dev\"],"
                + "\"preview_text\":\"pre\",\"topic_id\":\"t1\",\"send\":true,"
                + "\"scheduled_at\":\"in 1 hour\"}"),
        body());

    ms.broadcasts()
        .update("b1", UpdateBroadcastOptions.builder().previewText("p").topicId(null).build());
    assertEquals("PATCH", server.method);
    assertEquals("/broadcasts/b1", server.path);
    assertEquals(json("{\"preview_text\":\"p\",\"topic_id\":null}"), body());
    assertFalse(body().has("name"));
  }

  @Test
  void topicsCarryVisibilityAndUpdate() throws Exception {
    ms.topics()
        .create(
            CreateTopicOptions.builder()
                .name("Product")
                .defaultSubscription(Subscription.OPT_IN)
                .visibility("public")
                .build());
    assertEquals("public", body().get("visibility").asText());

    ms.topics().update("t1", UpdateTopicOptions.builder().name("Renamed").build());
    assertEquals("PATCH", server.method);
    assertEquals("/topics/t1", server.path);
    assertEquals(json("{\"name\":\"Renamed\"}"), body());
  }

  @Test
  void segmentContacts() throws Exception {
    server.responseBody = "{\"object\":\"list\",\"data\":[],\"has_more\":false}";
    ms.segments().contacts("s1", ListOptions.builder().after("c9").build());
    assertEquals("GET", server.method);
    assertEquals("/segments/s1/contacts", server.path);
    assertEquals("after=c9", server.query);

    ms.segments()
        .contacts("s1", ListContactsOptions.builder().include(ContactInclude.TOPICS).build());
    assertEquals("/segments/s1/contacts", server.path);
    assertEquals("include=topics", server.query);
  }

  @Test
  void suppressions() throws Exception {
    server.responseBody = "{\"object\":\"suppression\",\"id\":\"sup_1\"}";
    ms.suppressions()
        .add(AddSuppressionOptions.builder().email("x@x.dev").origin(SuppressionOrigin.MANUAL).build());
    assertEquals("POST", server.method);
    assertEquals("/suppressions", server.path);
    assertEquals(json("{\"email\":\"x@x.dev\",\"origin\":\"manual\"}"), body());

    server.responseBody =
        "{\"object\":\"suppression\",\"id\":\"sup_1\",\"email\":\"x@x.dev\",\"origin\":\"bounce\","
            + "\"source_id\":\"e1\",\"created_at\":\"2026-01-01T00:00:00.000Z\"}";
    Suppression s = ms.suppressions().get("x@x.dev");
    assertEquals("GET", server.method);
    assertEquals("/suppressions/x%40x.dev", server.rawPath);
    assertEquals(SuppressionOrigin.BOUNCE, s.getOrigin());
    assertEquals("e1", s.getSourceId());

    server.responseBody = "{\"object\":\"list\",\"data\":[],\"has_more\":false}";
    ms.suppressions()
        .list(ListSuppressionsOptions.builder().limit(10).origin(SuppressionOrigin.COMPLAINT).build());
    assertEquals("/suppressions", server.path);
    assertEquals("limit=10&origin=complaint", server.query);

    server.responseBody = "{\"object\":\"suppression\",\"id\":\"sup_1\",\"deleted\":true}";
    ms.suppressions().remove("sup_1");
    assertEquals("DELETE", server.method);
    assertEquals("/suppressions/sup_1", server.path);

    server.responseBody = "{\"data\":[{\"object\":\"suppression\",\"id\":\"sup_1\"}]}";
    ms.suppressions()
        .batch()
        .add(
            AddSuppressionsOptions.builder()
                .emails(Arrays.asList("a@x.dev", "b@x.dev"))
                .origin(SuppressionOrigin.UNSUBSCRIBE)
                .build());
    assertEquals("POST", server.method);
    assertEquals("/suppressions/batch/add", server.path);
    assertEquals(json("{\"emails\":[\"a@x.dev\",\"b@x.dev\"],\"origin\":\"unsubscribe\"}"), body());

    server.responseBody = "{\"data\":[{\"object\":\"suppression\",\"id\":\"sup_1\",\"deleted\":true}]}";
    ms.suppressions().batch().remove(RemoveSuppressionsOptions.builder().id("sup_1").build());
    assertEquals("/suppressions/batch/remove", server.path);
    assertEquals(json("{\"ids\":[\"sup_1\"]}"), body());
    ms.suppressions().batch().remove(RemoveSuppressionsOptions.builder().email("a@x.dev").build());
    assertEquals(json("{\"emails\":[\"a@x.dev\"]}"), body());
    assertThrows(
        IllegalArgumentException.class,
        () -> RemoveSuppressionsOptions.builder().id("x").email("y").build());
  }

  static final String DOMAIN_JSON =
      "{\"object\":\"domain\",\"id\":\"d1\",\"name\":\"x.dev\",\"status\":\"pending\","
          + "\"created_at\":\"2026-01-01T00:00:00.000Z\",\"region\":\"us-east-1\","
          + "\"open_tracking\":false,\"click_tracking\":true,\"tracking_subdomain\":\"links\","
          + "\"capabilities\":{\"sending\":\"enabled\",\"receiving\":\"disabled\"},"
          + "\"records\":[{\"record\":\"DKIM\",\"name\":\"k._domainkey\",\"type\":\"CNAME\","
          + "\"ttl\":\"Auto\",\"status\":\"pending\",\"value\":\"k.dkim.amazonses.com\"},"
          + "{\"record\":\"MX\",\"name\":\"send\",\"type\":\"MX\",\"ttl\":\"Auto\","
          + "\"status\":\"pending\",\"value\":\"feedback-smtp.amazonses.com\",\"priority\":10}]}";

  @Test
  void domains() throws Exception {
    server.responseBody = DOMAIN_JSON;
    Domain d =
        ms.domains()
            .create(
                CreateDomainOptions.builder()
                    .name("x.dev")
                    .region("us-east-1")
                    .customReturnPath("mail")
                    .openTracking(false)
                    .clickTracking(true)
                    .trackingSubdomain("links")
                    .build());
    assertEquals("POST", server.method);
    assertEquals("/domains", server.path);
    assertEquals(
        json(
            "{\"name\":\"x.dev\",\"region\":\"us-east-1\",\"custom_return_path\":\"mail\","
                + "\"open_tracking\":false,\"click_tracking\":true,\"tracking_subdomain\":\"links\"}"),
        body());
    assertEquals("d1", d.getId());
    assertTrue(d.isClickTracking());
    assertEquals("enabled", d.getCapabilities().get("sending"));
    assertEquals(2, d.getRecords().size());
    assertNull(d.getRecords().get(0).getPriority());
    assertEquals(10, d.getRecords().get(1).getPriority());

    ms.domains().get("d1");
    assertEquals("GET", server.method);
    assertEquals("/domains/d1", server.path);

    server.responseBody = "{\"object\":\"list\",\"data\":[],\"has_more\":false}";
    ms.domains().list(ListOptions.builder().limit(3).build());
    assertEquals("/domains", server.path);
    assertEquals("limit=3", server.query);

    server.responseBody = DOMAIN_JSON;
    ms.domains().verify("d1");
    assertEquals("POST", server.method);
    assertEquals("/domains/d1/verify", server.path);

    ms.domains()
        .update(UpdateDomainOptions.builder().id("d1").openTracking(true).trackingSubdomain(null).build());
    assertEquals("PATCH", server.method);
    assertEquals("/domains/d1", server.path);
    assertEquals(json("{\"open_tracking\":true,\"tracking_subdomain\":null}"), body());
    assertFalse(body().has("click_tracking"));

    server.responseBody = "{\"object\":\"domain\",\"id\":\"d1\",\"deleted\":true}";
    ms.domains().remove("d1");
    assertEquals("DELETE", server.method);
    assertEquals("/domains/d1", server.path);
  }

  @Test
  void webhooks() throws Exception {
    server.responseBody = "{\"object\":\"webhook\",\"id\":\"w1\",\"signing_secret\":\"whsec_abc\"}";
    CreateWebhookResponse created =
        ms.webhooks()
            .create(
                CreateWebhookOptions.builder()
                    .endpoint("https://x.dev/hook")
                    .events(WebhookEvent.EMAIL_DELIVERED, WebhookEvent.QUOTA_REACHED)
                    .signingSecret("whsec_abc")
                    .build());
    assertEquals("POST", server.method);
    assertEquals("/webhooks", server.path);
    assertEquals(
        json(
            "{\"endpoint\":\"https://x.dev/hook\",\"events\":[\"email.delivered\",\"quota.reached\"],"
                + "\"signing_secret\":\"whsec_abc\"}"),
        body());
    assertEquals("whsec_abc", created.getSigningSecret());

    server.responseBody =
        "{\"object\":\"webhook\",\"id\":\"w1\",\"endpoint\":\"https://x.dev/hook\","
            + "\"created_at\":\"2026-01-01T00:00:00.000Z\",\"status\":\"enabled\","
            + "\"events\":[\"email.delivered\"],\"signing_secret\":\"whsec_abc\","
            + "\"previous_secret_expires_at\":\"2026-01-02T00:00:00.000Z\"}";
    Webhook w = ms.webhooks().get("w1");
    assertEquals("GET", server.method);
    assertEquals("/webhooks/w1", server.path);
    assertEquals("whsec_abc", w.getSigningSecret());
    assertEquals("email.delivered", w.getEvents().get(0));
    assertEquals("2026-01-02T00:00:00.000Z", w.getPreviousSecretExpiresAt());

    server.responseBody = "{\"object\":\"list\",\"data\":[],\"has_more\":false}";
    ms.webhooks().list();
    assertEquals("/webhooks", server.path);

    server.responseBody = "{\"object\":\"webhook\",\"id\":\"w1\"}";
    ms.webhooks()
        .update("w1", UpdateWebhookOptions.builder().status("disabled").events(WebhookEvent.EMAIL_SENT).build());
    assertEquals("PATCH", server.method);
    assertEquals("/webhooks/w1", server.path);
    assertEquals(json("{\"events\":[\"email.sent\"],\"status\":\"disabled\"}"), body());

    server.responseBody = "{\"object\":\"webhook\",\"id\":\"w1\",\"deleted\":true}";
    ms.webhooks().remove("w1");
    assertEquals("DELETE", server.method);
    assertEquals("/webhooks/w1", server.path);
  }

  @Test
  void webhookRotate() throws Exception {
    server.responseBody =
        "{\"object\":\"webhook\",\"id\":\"w1\",\"signing_secret\":\"whsec_new\","
            + "\"previous_secret_expires_at\":\"2026-01-02T00:00:00.000Z\"}";
    RotateWebhookResponse r = ms.webhooks().rotate("w1");
    assertEquals("POST", server.method);
    assertEquals("/webhooks/w1/rotate", server.path);
    assertEquals(json("{}"), body());
    assertEquals("whsec_new", r.getSigningSecret());
    assertEquals("2026-01-02T00:00:00.000Z", r.getPreviousSecretExpiresAt());

    server.responseBody =
        "{\"object\":\"webhook\",\"id\":\"w1\",\"signing_secret\":\"whsec_mine\","
            + "\"previous_secret_expires_at\":null}";
    r =
        ms.webhooks()
            .rotate("w1", RotateWebhookOptions.builder().signingSecret("whsec_mine").overlapHours(0).build());
    assertEquals(json("{\"signing_secret\":\"whsec_mine\",\"overlap_hours\":0}"), body());
    assertNull(r.getPreviousSecretExpiresAt());

    ms.webhooks().rotate("w1", RotateWebhookOptions.builder().overlapHours(48).build());
    assertEquals(json("{\"overlap_hours\":48}"), body());
  }

  @Test
  void apiKeys() throws Exception {
    server.responseBody = "{\"id\":\"k1\",\"token\":\"ms_secret\"}";
    CreateApiKeyResponse created =
        ms.apiKeys()
            .create(
                CreateApiKeyOptions.builder()
                    .name("ci")
                    .permission("sending_access")
                    .domainId("d1")
                    .build());
    assertEquals("POST", server.method);
    assertEquals("/api-keys", server.path);
    assertEquals(
        json("{\"name\":\"ci\",\"permission\":\"sending_access\",\"domain_id\":\"d1\"}"), body());
    assertEquals("ms_secret", created.getToken());

    server.responseBody =
        "{\"object\":\"list\",\"data\":[{\"id\":\"k1\",\"name\":\"ci\","
            + "\"created_at\":\"2026-01-01T00:00:00.000Z\",\"last_used_at\":null}],\"has_more\":false}";
    assertNull(ms.apiKeys().list().getData().get(0).getLastUsedAt());
    assertEquals("GET", server.method);
    assertEquals("/api-keys", server.path);

    server.responseBody = "{\"object\":\"api_key\",\"id\":\"k1\",\"deleted\":true}";
    ms.apiKeys().remove("k1");
    assertEquals("DELETE", server.method);
    assertEquals("/api-keys/k1", server.path);
  }

  @Test
  void templates() throws Exception {
    server.responseBody = "{\"object\":\"template\",\"id\":\"t1\"}";
    ms.templates()
        .create(
            CreateTemplateOptions.builder()
                .name("Welcome")
                .html("<p>hi</p>")
                .subject("Hi")
                .text("hi")
                .alias("welcome")
                .from("Acme <a@x.dev>")
                .replyTo("r@x.dev")
                .variables(Collections.singletonList(Collections.singletonMap("key", "name")))
                .build());
    assertEquals("POST", server.method);
    assertEquals("/templates", server.path);
    assertEquals(
        json(
            "{\"name\":\"Welcome\",\"html\":\"<p>hi</p>\",\"subject\":\"Hi\",\"text\":\"hi\","
                + "\"alias\":\"welcome\",\"from\":\"Acme <a@x.dev>\",\"reply_to\":[\"r@x.dev\"],"
                + "\"variables\":[{\"key\":\"name\"}]}"),
        body());

    server.responseBody =
        "{\"object\":\"template\",\"id\":\"t1\",\"name\":\"Welcome\",\"alias\":\"welcome\","
            + "\"status\":\"published\",\"published_at\":\"2026-01-01T00:00:00.000Z\","
            + "\"created_at\":\"2026-01-01T00:00:00.000Z\",\"updated_at\":\"2026-01-01T00:00:00.000Z\","
            + "\"current_version_id\":\"v1\",\"from\":null,\"subject\":\"Hi\",\"reply_to\":null,"
            + "\"html\":\"<p>hi</p>\",\"text\":null,\"variables\":[],\"has_unpublished_versions\":false}";
    Template t = ms.templates().get("welcome");
    assertEquals("GET", server.method);
    assertEquals("/templates/welcome", server.path);
    assertEquals("v1", t.getCurrentVersionId());
    assertEquals("<p>hi</p>", t.getHtml());
    assertTrue(t.getVariables().isEmpty());

    server.responseBody = "{\"object\":\"list\",\"data\":[],\"has_more\":false}";
    ms.templates().list(ListOptions.builder().before("t0").build());
    assertEquals("/templates", server.path);
    assertEquals("before=t0", server.query);

    server.responseBody = "{\"object\":\"template\",\"id\":\"t1\"}";
    ms.templates()
        .update(
            "t1",
            UpdateTemplateOptions.builder()
                .html("<p>new</p>")
                .subject(null)
                .alias(null)
                .variables(Collections.emptyList())
                .build());
    assertEquals("PATCH", server.method);
    assertEquals("/templates/t1", server.path);
    assertEquals(
        json("{\"html\":\"<p>new</p>\",\"subject\":null,\"alias\":null,\"variables\":[]}"), body());

    ms.templates().publish("t1");
    assertEquals("POST", server.method);
    assertEquals("/templates/t1/publish", server.path);

    ms.templates().duplicate("t1");
    assertEquals("/templates/t1/duplicate", server.path);

    server.responseBody = "{\"object\":\"template\",\"id\":\"t1\",\"deleted\":true}";
    ms.templates().remove("welcome");
    assertEquals("DELETE", server.method);
    assertEquals("/templates/welcome", server.path);
  }

  @Test
  void contactProperties() throws Exception {
    server.responseBody =
        "{\"object\":\"contact_property\",\"id\":\"p1\",\"created_at\":\"2026-01-01T00:00:00.000Z\","
            + "\"key\":\"plan\",\"type\":\"string\",\"fallback_value\":\"free\"}";
    ContactProperty p =
        ms.contactProperties()
            .create(
                CreateContactPropertyOptions.builder().key("plan").type("string").fallbackValue("free").build());
    assertEquals("POST", server.method);
    assertEquals("/contact-properties", server.path);
    assertEquals(json("{\"key\":\"plan\",\"type\":\"string\",\"fallback_value\":\"free\"}"), body());
    assertEquals("free", p.getFallbackValue());

    server.responseBody =
        "{\"object\":\"contact_property\",\"id\":\"p2\",\"created_at\":\"2026-01-01T00:00:00.000Z\","
            + "\"key\":\"seats\",\"type\":\"number\",\"fallback_value\":null}";
    assertNull(ms.contactProperties().get("p2").getFallbackValue());
    assertEquals("GET", server.method);
    assertEquals("/contact-properties/p2", server.path);

    server.responseBody = "{\"object\":\"list\",\"data\":[],\"has_more\":false}";
    ms.contactProperties().list(ListOptions.builder().limit(50).build());
    assertEquals("/contact-properties", server.path);
    assertEquals("limit=50", server.query);

    server.responseBody = "{\"object\":\"contact_property\",\"id\":\"p1\"}";
    ms.contactProperties().update(UpdateContactPropertyOptions.builder().id("p1").fallbackValue(null).build());
    assertEquals("PATCH", server.method);
    assertEquals("/contact-properties/p1", server.path);
    assertEquals(json("{\"fallback_value\":null}"), body());

    server.responseBody = "{\"object\":\"contact_property\",\"id\":\"p1\",\"deleted\":true}";
    ms.contactProperties().remove("p1");
    assertEquals("DELETE", server.method);
    assertEquals("/contact-properties/p1", server.path);
  }

  @Test
  void usage() throws Exception {
    server.responseBody =
        "{\"object\":\"usage\",\"cloud\":true,\"plan\":\"pro\","
            + "\"limits\":{\"emails_per_day\":50000,\"domains\":10},"
            + "\"today\":{\"emails_sent\":123,\"resets_at\":\"2026-01-02T00:00:00.000Z\"},"
            + "\"team\":{\"id\":\"team_1\",\"name\":\"Acme\"},\"app_url\":\"https://app.millionsend.com\"}";
    UsageReport u = ms.usage().get();
    assertEquals("GET", server.method);
    assertEquals("/usage", server.path);
    assertTrue(u.isCloud());
    assertEquals("pro", u.getPlan());
    assertEquals(50000, u.getLimits().getEmailsPerDay());
    assertEquals(123, u.getToday().getEmailsSent());
    assertEquals("Acme", u.getTeam().getName());

    server.responseBody =
        "{\"object\":\"usage\",\"cloud\":false,\"plan\":null,"
            + "\"limits\":{\"emails_per_day\":null,\"domains\":null},"
            + "\"today\":{\"emails_sent\":0,\"resets_at\":\"2026-01-02T00:00:00.000Z\"},"
            + "\"team\":{\"id\":\"team_1\",\"name\":\"Acme\"},\"app_url\":null}";
    u = ms.usage().get();
    assertNull(u.getPlan());
    assertNull(u.getLimits().getEmailsPerDay());
  }
}

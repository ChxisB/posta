package com.millionsend.services;

import static com.millionsend.core.HttpClient.enc;

import com.fasterxml.jackson.core.type.TypeReference;
import com.millionsend.MillionSendException;
import com.millionsend.core.HttpClient;
import com.millionsend.core.RequestOptions;
import com.millionsend.model.BatchGetContactsResponse;
import com.millionsend.model.ConflictMode;
import com.millionsend.model.Contact;
import com.millionsend.model.ContactAddress;
import com.millionsend.model.ContactInclude;
import com.millionsend.model.ContactTopic;
import com.millionsend.model.CreateBatchContactsResponse;
import com.millionsend.model.CreateContactOptions;
import com.millionsend.model.DataResponse;
import com.millionsend.model.DeletedResponse;
import com.millionsend.model.Id;
import com.millionsend.model.ListContactsOptions;
import com.millionsend.model.ListOptions;
import com.millionsend.model.ListResponse;
import com.millionsend.model.PreferencesLink;
import com.millionsend.model.RemoveContactOptions;
import com.millionsend.model.RemoveContactResponse;
import com.millionsend.model.RemoveContactsOptions;
import com.millionsend.model.UpdateContactOptions;
import com.millionsend.model.UpdateContactTopicsOptions;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The {@code contacts} resource. Contacts are team-global and addressable by id
 * or email (email wins when both are set). Per-contact topic subscriptions live
 * under {@link #topics()}, segment membership under {@link #segments()}, and
 * bulk creation under {@link #batch()}.
 */
public final class Contacts {

  private final HttpClient http;
  private final ContactTopics topics;
  private final ContactSegments segments;
  private final ContactsBatch batch;

  public Contacts(HttpClient http) {
    this.http = http;
    this.topics = new ContactTopics(http);
    this.segments = new ContactSegments(http);
    this.batch = new ContactsBatch(http);
  }

  /** Per-contact topic subscriptions ({@code contacts().topics().list(...)} / {@code update(...)}). */
  public ContactTopics topics() {
    return topics;
  }

  /** Segment membership ({@code contacts().segments().add(...)}). */
  public ContactSegments segments() {
    return segments;
  }

  /** Bulk creation, lookup and removal ({@code contacts().batch().create(...)} / {@code get(...)} / {@code remove(...)}), MillionSend extensions. */
  public ContactsBatch batch() {
    return batch;
  }

  /** POST /contacts — 409 {@code validation_error} when the email already exists on the team. */
  public Id create(CreateContactOptions options) throws MillionSendException {
    return http.request("POST", "/contacts", options, null, null, new TypeReference<Id>() {});
  }

  /** GET a contact by a bare id. */
  public Contact get(String id) throws MillionSendException {
    return get(ContactAddress.id(id));
  }

  /** GET a contact by address. */
  public Contact get(ContactAddress address) throws MillionSendException {
    return http.request("GET", contactPath(address), null, null, null, new TypeReference<Contact>() {});
  }

  /** PATCH a contact. Only the fields set on {@code options} are sent (null clears). */
  public Id update(UpdateContactOptions options) throws MillionSendException {
    String path = contactPath(options.getId(), options.getEmail());
    return http.request("PATCH", path, options.getChanges(), null, null, new TypeReference<Id>() {});
  }

  /** DELETE a contact by a bare id. */
  public RemoveContactResponse remove(String id) throws MillionSendException {
    return remove(ContactAddress.id(id));
  }

  /** DELETE a contact by address. */
  public RemoveContactResponse remove(ContactAddress address) throws MillionSendException {
    return http.request(
        "DELETE", contactPath(address), null, null, null,
        new TypeReference<RemoveContactResponse>() {});
  }

  /**
   * DELETE /contacts/{idOrEmail}?erase=true — a plain delete keeps the contact's
   * emails in the send log; {@code erase} also scrubs the address from email
   * history, event payloads and API logs (a GDPR/LGPD erasure).
   */
  public RemoveContactResponse remove(RemoveContactOptions options) throws MillionSendException {
    return http.request(
        "DELETE", contactPath(options.getId(), options.getEmail()), null, options.toQuery(), null,
        new TypeReference<RemoveContactResponse>() {});
  }

  /** POST /contacts/{id}/preferences-link by a bare id. */
  public PreferencesLink preferencesLink(String id) throws MillionSendException {
    return preferencesLink(ContactAddress.id(id));
  }

  /**
   * POST /contacts/{idOrEmail}/preferences-link — a MillionSend extension: the
   * contact's hosted preference page (public topics plus the global
   * unsubscribe). 422 when the instance cannot build hosted links.
   */
  public PreferencesLink preferencesLink(ContactAddress address) throws MillionSendException {
    return http.request(
        "POST", contactPath(address) + "/preferences-link", null, null, null,
        new TypeReference<PreferencesLink>() {});
  }

  /** GET /contacts */
  public ListResponse<Contact> list() throws MillionSendException {
    return list((ListOptions) null);
  }

  /** GET /contacts with pagination. */
  public ListResponse<Contact> list(ListOptions options) throws MillionSendException {
    return http.request(
        "GET", "/contacts", null, options == null ? null : options.toQuery(), null,
        new TypeReference<ListResponse<Contact>>() {});
  }

  /**
   * GET /contacts?include=properties,topics — a MillionSend extension: attaches
   * the property map and/or the topic subscriptions to every item, so an
   * audience reads in one request per page instead of one per contact.
   */
  public ListResponse<Contact> list(ListContactsOptions options) throws MillionSendException {
    return http.request(
        "GET", "/contacts", null, options == null ? null : options.toQuery(), null,
        new TypeReference<ListResponse<Contact>>() {});
  }

  private static String contactPath(ContactAddress a) {
    return contactPath(a.getId(), a.getEmail());
  }

  /** Email wins over id. */
  private static String contactPath(String id, String email) {
    return "/contacts/" + enc(email != null ? email : (id != null ? id : ""));
  }

  /** Per-contact topic subscriptions (opt in/out of a topic). */
  public static final class ContactTopics {

    private final HttpClient http;

    ContactTopics(HttpClient http) {
      this.http = http;
    }

    /**
     * GET /contacts/{idOrEmail}/topics — every topic with the contact's effective
     * subscription; {@code explicit} is false where that is the topic default.
     */
    public ListResponse<ContactTopic> list(String contactIdOrEmail) throws MillionSendException {
      return http.request(
          "GET", "/contacts/" + enc(contactIdOrEmail) + "/topics", null, null, null,
          new TypeReference<ListResponse<ContactTopic>>() {});
    }

    /** PATCH /contacts/{idOrEmail}/topics with the bare array of topic updates. */
    public Id update(UpdateContactTopicsOptions options) throws MillionSendException {
      String key = enc(options.getEmail() != null ? options.getEmail() : options.getId());
      return http.request(
          "PATCH", "/contacts/" + key + "/topics", options.getTopics(), null, null,
          new TypeReference<Id>() {});
    }
  }

  /** Segment membership of a contact. */
  public static final class ContactSegments {

    private final HttpClient http;

    ContactSegments(HttpClient http) {
      this.http = http;
    }

    /** POST /contacts/{idOrEmail}/segments/{segmentId} — idempotent. */
    public Id add(String contactIdOrEmail, String segmentId) throws MillionSendException {
      return http.request(
          "POST", "/contacts/" + enc(contactIdOrEmail) + "/segments/" + enc(segmentId), null, null,
          null, new TypeReference<Id>() {});
    }

    /** DELETE /contacts/{idOrEmail}/segments/{segmentId} — 404 when not a member. */
    public DeletedResponse remove(String contactIdOrEmail, String segmentId)
        throws MillionSendException {
      return http.request(
          "DELETE", "/contacts/" + enc(contactIdOrEmail) + "/segments/" + enc(segmentId), null,
          null, null, new TypeReference<DeletedResponse>() {});
    }
  }

  /** Bulk contact creation, lookup and removal, up to 1000 items per call. */
  public static final class ContactsBatch {

    private final HttpClient http;

    ContactsBatch(HttpClient http) {
      this.http = http;
    }

    /** POST /contacts/batch with the server defaults ({@code on_conflict=error}, strict validation). */
    public CreateBatchContactsResponse create(List<CreateContactOptions> contacts)
        throws MillionSendException {
      return create(contacts, null, null);
    }

    /** POST /contacts/batch?on_conflict={mode} */
    public CreateBatchContactsResponse create(
        List<CreateContactOptions> contacts, ConflictMode onConflict) throws MillionSendException {
      return create(contacts, onConflict, null);
    }

    /**
     * POST /contacts/batch?on_conflict={mode} with per-request options — set
     * {@code batchValidation(PERMISSIVE)} to write the valid items and get the
     * rest back in {@code errors}.
     */
    public CreateBatchContactsResponse create(
        List<CreateContactOptions> contacts, ConflictMode onConflict, RequestOptions requestOptions)
        throws MillionSendException {
      return http.request(
          "POST", "/contacts/batch", contacts,
          onConflict == null ? null : Collections.singletonMap("on_conflict", onConflict.getValue()),
          requestOptions, new TypeReference<CreateBatchContactsResponse>() {});
    }

    /**
     * POST /contacts/batch/get — up to 1000 contacts by id or email in one
     * request (one request against the rate limit), returned in request order;
     * entries that match no contact come back under {@code missing} instead of
     * failing the call. Pass {@link ContactInclude} values to attach properties
     * and/or topics to every contact.
     */
    public BatchGetContactsResponse get(List<ContactAddress> addresses, ContactInclude... include)
        throws MillionSendException {
      // The wire wants exactly one key per entry; email wins over id like everywhere else.
      List<Map<String, String>> contacts = new ArrayList<>(addresses.size());
      for (ContactAddress a : addresses) {
        contacts.add(
            a.getEmail() != null
                ? Collections.singletonMap("email", a.getEmail())
                : Collections.singletonMap("id", a.getId()));
      }
      Map<String, Object> body = new LinkedHashMap<>();
      body.put("contacts", contacts);
      if (include.length > 0) {
        body.put("include", Arrays.asList(include));
      }
      return http.request(
          "POST", "/contacts/batch/get", body, null, null,
          new TypeReference<BatchGetContactsResponse>() {});
    }

    /** POST /contacts/batch/remove — by emails or by ids; lists only the rows actually deleted. Their emails stay in the send log unless {@code erase} is set. */
    public DataResponse<RemoveContactResponse> remove(RemoveContactsOptions options)
        throws MillionSendException {
      return http.request(
          "POST", "/contacts/batch/remove", options, null, null,
          new TypeReference<DataResponse<RemoveContactResponse>>() {});
    }
  }
}

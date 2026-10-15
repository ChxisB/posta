package io.github.tacklabs.posta.services;

import static io.github.tacklabs.posta.core.HttpClient.enc;

import com.fasterxml.jackson.core.type.TypeReference;
import io.github.tacklabs.posta.PostaException;
import io.github.tacklabs.posta.core.HttpClient;
import io.github.tacklabs.posta.model.Contact;
import io.github.tacklabs.posta.model.CreateSegmentOptions;
import io.github.tacklabs.posta.model.DeletedResponse;
import io.github.tacklabs.posta.model.ListContactsOptions;
import io.github.tacklabs.posta.model.ListOptions;
import io.github.tacklabs.posta.model.ListResponse;
import io.github.tacklabs.posta.model.Segment;
import io.github.tacklabs.posta.model.UpdateSegmentOptions;

/**
 * The {@code segments} resource. Posta dynamic segments (a saved filter
 * over the team's contacts). No Resend equivalent.
 */
public final class Segments {

  private final HttpClient http;

  public Segments(HttpClient http) {
    this.http = http;
  }

  /** POST /segments */
  public Segment create(CreateSegmentOptions options) throws PostaException {
    return http.request("POST", "/segments", options, null, null, new TypeReference<Segment>() {});
  }

  /** GET /segments/{id}: includes a live {@code contactCount}. */
  public Segment get(String id) throws PostaException {
    return http.request(
        "GET", "/segments/" + enc(id), null, null, null, new TypeReference<Segment>() {});
  }

  /** GET /segments */
  public ListResponse<Segment> list() throws PostaException {
    return list(null);
  }

  /** GET /segments with pagination. */
  public ListResponse<Segment> list(ListOptions options) throws PostaException {
    return http.request(
        "GET", "/segments", null, options == null ? null : options.toQuery(), null,
        new TypeReference<ListResponse<Segment>>() {});
  }

  /** PATCH /segments/{id} */
  public Segment update(String id, UpdateSegmentOptions options) throws PostaException {
    return http.request(
        "PATCH", "/segments/" + enc(id), options, null, null, new TypeReference<Segment>() {});
  }

  /** GET /segments/{id}/contacts: the contacts currently matching the segment. */
  public ListResponse<Contact> contacts(String id) throws PostaException {
    return contacts(id, (ListOptions) null);
  }

  /** GET /segments/{id}/contacts with pagination. */
  public ListResponse<Contact> contacts(String id, ListOptions options)
      throws PostaException {
    return http.request(
        "GET", "/segments/" + enc(id) + "/contacts", null,
        options == null ? null : options.toQuery(), null,
        new TypeReference<ListResponse<Contact>>() {});
  }

  /**
   * GET /segments/{id}/contacts?include=properties,topics: attaches the
   * property map and/or the topic subscriptions to every item (a Posta
   * extension).
   */
  public ListResponse<Contact> contacts(String id, ListContactsOptions options)
      throws PostaException {
    return http.request(
        "GET", "/segments/" + enc(id) + "/contacts", null,
        options == null ? null : options.toQuery(), null,
        new TypeReference<ListResponse<Contact>>() {});
  }

  /** DELETE /segments/{id} */
  public DeletedResponse remove(String id) throws PostaException {
    return http.request(
        "DELETE", "/segments/" + enc(id), null, null, null,
        new TypeReference<DeletedResponse>() {});
  }
}

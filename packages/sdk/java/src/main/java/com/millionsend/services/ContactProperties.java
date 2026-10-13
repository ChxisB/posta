package com.millionsend.services;

import static com.millionsend.core.HttpClient.enc;

import com.fasterxml.jackson.core.type.TypeReference;
import com.millionsend.MillionSendException;
import com.millionsend.core.HttpClient;
import com.millionsend.model.ContactProperty;
import com.millionsend.model.CreateContactPropertyOptions;
import com.millionsend.model.DeletedResponse;
import com.millionsend.model.Id;
import com.millionsend.model.ListOptions;
import com.millionsend.model.ListResponse;
import com.millionsend.model.UpdateContactPropertyOptions;

/** The {@code contactProperties} resource: the custom property definitions contacts can carry. */
public final class ContactProperties {

  private final HttpClient http;

  public ContactProperties(HttpClient http) {
    this.http = http;
  }

  /** POST /contact-properties */
  public ContactProperty create(CreateContactPropertyOptions options) throws MillionSendException {
    return http.request(
        "POST", "/contact-properties", options, null, null,
        new TypeReference<ContactProperty>() {});
  }

  /** GET /contact-properties/{id} */
  public ContactProperty get(String id) throws MillionSendException {
    return http.request(
        "GET", "/contact-properties/" + enc(id), null, null, null,
        new TypeReference<ContactProperty>() {});
  }

  /** GET /contact-properties */
  public ListResponse<ContactProperty> list() throws MillionSendException {
    return list(null);
  }

  /** GET /contact-properties with pagination. */
  public ListResponse<ContactProperty> list(ListOptions options) throws MillionSendException {
    return http.request(
        "GET", "/contact-properties", null, options == null ? null : options.toQuery(), null,
        new TypeReference<ListResponse<ContactProperty>>() {});
  }

  /** PATCH /contact-properties/{id} — only {@code fallbackValue} is updatable (null clears). */
  public Id update(UpdateContactPropertyOptions options) throws MillionSendException {
    return http.request(
        "PATCH", "/contact-properties/" + enc(options.getId()), options.getChanges(), null, null,
        new TypeReference<Id>() {});
  }

  /** DELETE /contact-properties/{id} */
  public DeletedResponse remove(String id) throws MillionSendException {
    return http.request(
        "DELETE", "/contact-properties/" + enc(id), null, null, null,
        new TypeReference<DeletedResponse>() {});
  }
}

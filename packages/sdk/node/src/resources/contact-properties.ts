import type { Result } from "../error.js";
import type { HttpClient } from "../http.js";
import { listQuery } from "../query.js";
import type {
  ContactProperty,
  ContactPropertyId,
  ContactPropertyListItem,
  CreateContactPropertyOptions,
  List,
  ListOptions,
  RemoveContactPropertyResponse,
  UpdateContactPropertyOptions,
} from "../types.js";

/** Custom contact property definitions (key, type, fallback). */
export class ContactProperties {
  constructor(private readonly http: HttpClient) {}

  create(payload: CreateContactPropertyOptions): Promise<Result<ContactProperty>> {
    return this.http.request({
      method: "POST",
      path: "/contact-properties",
      body: { key: payload.key, type: payload.type, fallback_value: payload.fallbackValue },
    });
  }

  list(options?: ListOptions): Promise<Result<List<ContactPropertyListItem>>> {
    return this.http.request({
      method: "GET",
      path: "/contact-properties",
      query: listQuery(options),
    });
  }

  get(id: string): Promise<Result<ContactProperty>> {
    return this.http.request({
      method: "GET",
      path: `/contact-properties/${encodeURIComponent(id)}`,
    });
  }

  /** PATCH /contact-properties/:id — `fallbackValue: null` clears it. */
  update(payload: UpdateContactPropertyOptions): Promise<Result<ContactPropertyId>> {
    return this.http.request({
      method: "PATCH",
      path: `/contact-properties/${encodeURIComponent(payload.id)}`,
      body: { fallback_value: payload.fallbackValue },
    });
  }

  remove(id: string): Promise<Result<RemoveContactPropertyResponse>> {
    return this.http.request({
      method: "DELETE",
      path: `/contact-properties/${encodeURIComponent(id)}`,
    });
  }
}

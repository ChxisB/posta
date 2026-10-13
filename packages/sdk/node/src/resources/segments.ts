import type { Result } from "../error.js";
import type { HttpClient } from "../http.js";
import { listQuery } from "../query.js";
import type {
  CreateSegmentOptions,
  List,
  ListOptions,
  RemoveSegmentResponse,
  Segment,
  UpdateSegmentOptions,
} from "../types.js";

/**
 * Dynamic segments — a saved filter over the team's contacts (MillionSend
 * extension, no Resend equivalent). `get` returns a live `contact_count`.
 */
export class Segments {
  constructor(private readonly http: HttpClient) {}

  create(payload: CreateSegmentOptions): Promise<Result<Segment>> {
    return this.http.request({
      method: "POST",
      path: "/segments",
      body: { name: payload.name, filter: payload.filter },
    });
  }

  get(id: string): Promise<Result<Segment>> {
    return this.http.request({ method: "GET", path: `/segments/${encodeURIComponent(id)}` });
  }

  list(options?: ListOptions): Promise<Result<List<Segment>>> {
    return this.http.request({ method: "GET", path: "/segments", query: listQuery(options) });
  }

  update(id: string, payload: UpdateSegmentOptions): Promise<Result<Segment>> {
    return this.http.request({
      method: "PATCH",
      path: `/segments/${encodeURIComponent(id)}`,
      body: { name: payload.name, filter: payload.filter },
    });
  }

  remove(id: string): Promise<Result<RemoveSegmentResponse>> {
    return this.http.request({ method: "DELETE", path: `/segments/${encodeURIComponent(id)}` });
  }
}

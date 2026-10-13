import type { Result } from "../error.js";
import type { HttpClient } from "../http.js";
import { listQuery } from "../query.js";
import type {
  Broadcast,
  BroadcastId,
  BroadcastListItem,
  CancelBroadcastResponse,
  CreateBroadcastOptions,
  List,
  ListOptions,
  RemoveBroadcastResponse,
  SendBroadcastOptions,
  UpdateBroadcastOptions,
} from "../types.js";

function toWire(o: UpdateBroadcastOptions) {
  return {
    name: o.name,
    segment_id: o.segmentId,
    from: o.from,
    subject: o.subject,
    html: o.html,
    text: o.text,
    reply_to: o.replyTo,
    preview_text: o.previewText,
    topic_id: o.topicId,
  };
}

export class Broadcasts {
  constructor(private readonly http: HttpClient) {}

  /** POST /broadcasts — a draft unless `send: true` (optionally with `scheduledAt`). */
  create(payload: CreateBroadcastOptions): Promise<Result<BroadcastId>> {
    return this.http.request({
      method: "POST",
      path: "/broadcasts",
      body: { ...toWire(payload), send: payload.send, scheduled_at: payload.scheduledAt },
    });
  }

  get(id: string): Promise<Result<Broadcast>> {
    return this.http.request({ method: "GET", path: `/broadcasts/${encodeURIComponent(id)}` });
  }

  list(options?: ListOptions): Promise<Result<List<BroadcastListItem>>> {
    return this.http.request({ method: "GET", path: "/broadcasts", query: listQuery(options) });
  }

  update(id: string, payload: UpdateBroadcastOptions): Promise<Result<BroadcastId>> {
    return this.http.request({
      method: "PATCH",
      path: `/broadcasts/${encodeURIComponent(id)}`,
      body: toWire(payload),
    });
  }

  remove(id: string): Promise<Result<RemoveBroadcastResponse>> {
    return this.http.request({ method: "DELETE", path: `/broadcasts/${encodeURIComponent(id)}` });
  }

  /** POST /broadcasts/:id/send — omit scheduledAt to send now. */
  send(id: string, options: SendBroadcastOptions = {}): Promise<Result<BroadcastId>> {
    return this.http.request({
      method: "POST",
      path: `/broadcasts/${encodeURIComponent(id)}/send`,
      body: { scheduled_at: options.scheduledAt },
    });
  }

  cancel(id: string): Promise<Result<CancelBroadcastResponse>> {
    return this.http.request({
      method: "POST",
      path: `/broadcasts/${encodeURIComponent(id)}/cancel`,
    });
  }
}

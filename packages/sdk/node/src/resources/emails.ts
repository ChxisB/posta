import type { Result } from "../error.js";
import type { BatchRequestOptions, HttpClient, RequestOptions } from "../http.js";
import { listQuery } from "../query.js";
import type {
  BatchResponse,
  CancelEmailResponse,
  CreateEmailResponse,
  Email,
  EmailInsights,
  EmailListItem,
  List,
  ListOptions,
  RemoveEmailResponse,
  SendEmailOptions,
  UpdateEmailOptions,
  UpdateEmailResponse,
} from "../types.js";

function toWire(o: SendEmailOptions) {
  return {
    from: o.from,
    to: o.to,
    subject: o.subject,
    html: o.html,
    text: o.text,
    cc: o.cc,
    bcc: o.bcc,
    reply_to: o.replyTo,
    scheduled_at: o.scheduledAt,
    tags: o.tags,
    topic_id: o.topicId,
    attachments: o.attachments?.map((a) => ({
      filename: a.filename,
      content: Buffer.isBuffer(a.content) ? a.content.toString("base64") : a.content,
      content_type: a.contentType,
      content_id: a.contentId,
      path: a.path,
    })),
    headers: o.headers,
    template: o.template,
  };
}

export class Emails {
  constructor(private readonly http: HttpClient) {}

  /** POST /emails — supports an Idempotency-Key. */
  send(
    payload: SendEmailOptions,
    options: RequestOptions = {},
  ): Promise<Result<CreateEmailResponse>> {
    return this.http.request({
      method: "POST",
      path: "/emails",
      body: toWire(payload),
      idempotencyKey: options.idempotencyKey,
    });
  }

  /** Alias of {@link send}, mirroring Resend. */
  create(
    payload: SendEmailOptions,
    options: RequestOptions = {},
  ): Promise<Result<CreateEmailResponse>> {
    return this.send(payload, options);
  }

  /** GET /emails/:id */
  get(id: string): Promise<Result<Email>> {
    return this.http.request({ method: "GET", path: `/emails/${encodeURIComponent(id)}` });
  }

  /** GET /emails */
  list(options?: ListOptions): Promise<Result<List<EmailListItem>>> {
    return this.http.request({ method: "GET", path: "/emails", query: listQuery(options) });
  }

  /** PATCH /emails/:id — reschedule a scheduled, unsent email. */
  update(payload: UpdateEmailOptions): Promise<Result<UpdateEmailResponse>> {
    return this.http.request({
      method: "PATCH",
      path: `/emails/${encodeURIComponent(payload.id)}`,
      body: { scheduled_at: payload.scheduledAt },
    });
  }

  /** GET /emails/:id/insights — not_found until insights exist for the email. */
  getInsights(id: string): Promise<Result<EmailInsights>> {
    return this.http.request({
      method: "GET",
      path: `/emails/${encodeURIComponent(id)}/insights`,
    });
  }

  /** POST /emails/:id/cancel — only scheduled, unsent emails. */
  cancel(id: string): Promise<Result<CancelEmailResponse>> {
    return this.http.request({
      method: "POST",
      path: `/emails/${encodeURIComponent(id)}/cancel`,
    });
  }

  /** DELETE /emails/:id — removes the email and its events. */
  remove(id: string): Promise<Result<RemoveEmailResponse>> {
    return this.http.request({ method: "DELETE", path: `/emails/${encodeURIComponent(id)}` });
  }
}

export class Batch {
  constructor(private readonly http: HttpClient) {}

  /** POST /emails/batch — 1–100 emails in one call; supports an Idempotency-Key and `batchValidation`. */
  send(
    payload: SendEmailOptions[],
    options: BatchRequestOptions = {},
  ): Promise<Result<BatchResponse>> {
    return this.http.request({
      method: "POST",
      path: "/emails/batch",
      body: payload.map(toWire),
      idempotencyKey: options.idempotencyKey,
      headers: { "x-batch-validation": options.batchValidation },
    });
  }

  /** Alias of {@link send}, mirroring Resend. */
  create(
    payload: SendEmailOptions[],
    options: BatchRequestOptions = {},
  ): Promise<Result<BatchResponse>> {
    return this.send(payload, options);
  }
}
